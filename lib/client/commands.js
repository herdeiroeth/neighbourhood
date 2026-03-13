import http from 'node:http';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ENDPOINTS } from '../shared/protocol.js';
import { formatSize, formatDate } from '../shared/format.js';
import { ProgressBar } from './progress.js';
import { getPartialSize, makeRangeHeader, partPath, finalize } from './resume.js';

function request(host, port, endpoint, queryPath, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = `${endpoint}?path=${encodeURIComponent(queryPath)}`;
    const req = http.get({ host, port, path: url, headers: extraHeaders }, resolve);
    req.on('error', reject);
  });
}

async function readJson(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

export async function cmdList(host, port, remotePath) {
  const res = await request(host, port, ENDPOINTS.LIST, remotePath);
  if (res.statusCode !== 200) {
    const body = await readJson(res);
    console.error(`Error: ${body.error}`);
    process.exit(1);
  }

  const items = await readJson(res);
  if (items.length === 0) {
    console.log('  (empty directory)');
    return;
  }

  const maxName = Math.min(60, Math.max(...items.map(i => i.name.length)));

  for (const item of items) {
    const typeStr = item.type === 'dir' ? '[DIR]' : formatSize(item.size).padStart(10);
    const name = item.name.padEnd(maxName + 2);
    const date = formatDate(item.mtime);
    console.log(`  ${typeStr}  ${name}  ${date}`);
  }
  console.log(`\n  ${items.length} items`);
}

export async function cmdGet(host, port, remotePath, localDir) {
  // Get file info first
  const statRes = await request(host, port, ENDPOINTS.STAT, remotePath);
  if (statRes.statusCode !== 200) {
    const body = await readJson(statRes);
    console.error(`Error: ${body.error}`);
    process.exit(1);
  }
  const info = await readJson(statRes);

  if (info.type === 'dir') {
    console.error('Use get-dir for directories');
    process.exit(1);
  }

  const fileName = info.name;
  const totalSize = info.size;
  const localFile = path.join(localDir, fileName);

  // Check for partial download
  const partialSize = await getPartialSize(localFile);
  if (partialSize > 0 && partialSize < totalSize) {
    console.log(`  Resuming from ${formatSize(partialSize)} / ${formatSize(totalSize)}`);
  } else if (partialSize >= totalSize && totalSize > 0) {
    finalize(localFile);
    console.log(`  Already complete: ${fileName}`);
    return;
  }

  console.log(`  Downloading: ${fileName} (${formatSize(totalSize)})`);

  const headers = makeRangeHeader(partialSize);
  const res = await request(host, port, ENDPOINTS.DOWNLOAD, remotePath, headers);

  if (res.statusCode !== 200 && res.statusCode !== 206) {
    const body = await readJson(res);
    console.error(`Error: ${body.error}`);
    process.exit(1);
  }

  const progress = new ProgressBar(totalSize);
  progress.received = partialSize;

  const ws = createWriteStream(partPath(localFile), { flags: partialSize > 0 ? 'a' : 'w' });

  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      ws.write(chunk);
      progress.update(chunk.length);
    });

    res.on('end', () => {
      ws.end(() => {
        progress.finish();
        finalize(localFile);
        resolve();
      });
    });

    res.on('error', (err) => {
      ws.end();
      console.error(`\n  Transfer interrupted: ${err.message}`);
      console.error(`  Run the same command to resume.`);
      reject(err);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      ws.end();
      console.error(`\n  Interrupted. Run the same command to resume.`);
      process.exit(0);
    });
  });
}

const BLOCK_SIZE = 512;

function parseTarHeader(buf) {
  if (buf.every(b => b === 0)) return null; // End of archive

  const name = buf.subarray(0, 100).toString().replace(/\0+$/, '');
  const sizeStr = buf.subarray(124, 136).toString().replace(/\0+$/, '').trim();
  const size = parseInt(sizeStr, 8) || 0;
  const typeflag = String.fromCharCode(buf[156]);

  if (!name) return null;
  return { name, size, typeflag };
}

export async function cmdGetDir(host, port, remotePath, localDir) {
  const dirName = remotePath.split('/').filter(Boolean).pop() || 'download';
  console.log(`  Downloading directory: ${remotePath}`);

  const res = await request(host, port, ENDPOINTS.DOWNLOAD_DIR, remotePath);

  if (res.statusCode !== 200) {
    const body = await readJson(res);
    console.error(`Error: ${body.error}`);
    process.exit(1);
  }

  const totalSize = parseInt(res.headers['content-length'], 10) || 0;
  const progress = totalSize > 0 ? new ProgressBar(totalSize) : null;

  let buffer = Buffer.alloc(0);
  let state = 'header'; // 'header' | 'data'
  let currentFile = null;
  let currentWs = null;
  let bytesRemaining = 0;
  let filesExtracted = 0;

  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      if (progress) progress.update(chunk.length);
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length > 0) {
        if (state === 'header') {
          if (buffer.length < BLOCK_SIZE) break;
          const headerBuf = buffer.subarray(0, BLOCK_SIZE);
          buffer = buffer.subarray(BLOCK_SIZE);

          const header = parseTarHeader(headerBuf);
          if (!header) continue; // skip zero blocks

          // Sanitize and create file path
          const safeName = header.name.replace(/\.\./g, '_');
          const fullPath = path.join(localDir, safeName);

          if (header.typeflag === '5' || header.size === 0 && header.name.endsWith('/')) {
            // Directory entry
            mkdirSync(fullPath, { recursive: true });
            continue;
          }

          // Regular file
          mkdirSync(path.dirname(fullPath), { recursive: true });
          currentWs = createWriteStream(fullPath);
          bytesRemaining = header.size;
          currentFile = header;
          state = 'data';
          filesExtracted++;
        }

        if (state === 'data') {
          if (buffer.length === 0) break;

          const toWrite = Math.min(buffer.length, bytesRemaining);
          if (toWrite > 0) {
            currentWs.write(buffer.subarray(0, toWrite));
            bytesRemaining -= toWrite;
            buffer = buffer.subarray(toWrite);
          }

          if (bytesRemaining === 0) {
            currentWs.end();
            currentWs = null;

            // Skip padding
            const totalWithPadding = currentFile.size;
            const padding = (BLOCK_SIZE - (totalWithPadding % BLOCK_SIZE)) % BLOCK_SIZE;
            if (padding > 0) {
              if (buffer.length < padding) break; // wait for more data
              buffer = buffer.subarray(padding);
            }

            state = 'header';
          }
        }
      }
    });

    res.on('end', () => {
      if (currentWs) currentWs.end();
      if (progress) progress.finish();
      console.log(`  Extracted ${filesExtracted} files to ${localDir}`);
      resolve();
    });

    res.on('error', reject);

    process.on('SIGINT', () => {
      if (currentWs) currentWs.end();
      console.error(`\n  Interrupted during directory download.`);
      process.exit(0);
    });
  });
}
