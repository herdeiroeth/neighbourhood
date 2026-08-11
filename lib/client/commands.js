import http from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ENDPOINTS } from '../shared/protocol.js';
import { formatSize, formatDate } from '../shared/format.js';
import { ProgressBar } from './progress.js';
import {
  createPartialWriteStream,
  finalize,
  getPartialSize,
  makeRangeHeader,
} from './resume.js';
import { extractTarStream } from './tar-extractor.js';

const INACTIVITY_TIMEOUT_MS = 30_000;

function request(host, port, endpoint, queryPath, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const requestPath = `${endpoint}?path=${encodeURIComponent(queryPath)}`;
    const req = http.get({ host, port, path: requestPath, headers: extraHeaders }, resolve);
    req.setTimeout(INACTIVITY_TIMEOUT_MS, () => {
      req.destroy(new Error('Connection timed out'));
    });
    req.on('error', reject);
  });
}

async function readJson(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Server returned an invalid response (HTTP ${res.statusCode})`);
  }
}

async function responseError(res) {
  const body = await readJson(res);
  return new Error(body.error || `HTTP ${res.statusCode}`);
}

function interruptResponse(
  res,
  message = 'Transfer interrupted; run the same file command to resume',
) {
  const error = new Error(message);
  error.code = 'EINTERRUPTED';
  res.destroy(error);
}

function validateRemoteFileInfo(info) {
  if (!info || typeof info !== 'object') throw new Error('Server returned invalid file metadata');
  if (info.type !== 'file' && info.type !== 'dir') {
    throw new Error('Server returned an invalid file type');
  }
  if (!Number.isSafeInteger(info.size) || info.size < 0) {
    throw new Error('Server returned an invalid file size');
  }
  if (
    typeof info.name !== 'string' ||
    !info.name ||
    info.name === '.' ||
    info.name === '..' ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(info.name) ||
    /[. ]$/.test(info.name) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(info.name) ||
    path.posix.basename(info.name) !== info.name ||
    path.win32.basename(info.name) !== info.name
  ) {
    throw new Error('Server returned an unsafe file name');
  }
  return info;
}

export async function cmdList(host, port, remotePath) {
  const res = await request(host, port, ENDPOINTS.LIST, remotePath);
  if (res.statusCode !== 200) throw await responseError(res);

  const items = await readJson(res);
  if (items.length === 0) {
    console.log('  (empty directory)');
    return;
  }

  const maxName = Math.min(60, Math.max(...items.map((item) => item.name.length)));
  for (const item of items) {
    const type = item.type === 'dir' ? '[DIR]' : formatSize(item.size).padStart(10);
    const name = item.name.padEnd(maxName + 2);
    console.log(`  ${type}  ${name}  ${formatDate(item.mtime)}`);
  }
  console.log(`\n  ${items.length} items`);
}

function validateContentRange(header, expectedStart, expectedEnd, totalSize) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header || '');
  return Boolean(
    match &&
    Number(match[1]) === expectedStart &&
    Number(match[2]) === expectedEnd &&
    Number(match[3]) === totalSize
  );
}

export async function cmdGet(host, port, remotePath, localDir) {
  const statResponse = await request(host, port, ENDPOINTS.STAT, remotePath);
  if (statResponse.statusCode !== 200) throw await responseError(statResponse);

  const info = validateRemoteFileInfo(await readJson(statResponse));
  if (info.type === 'dir') throw new Error('Use get-dir for directories');

  const fileName = info.name;
  const totalSize = info.size;
  const localFile = path.join(localDir, fileName);
  let partialSize = await getPartialSize(localFile);

  if (partialSize >= totalSize && partialSize > 0) {
    console.log('  Existing partial file cannot be verified; restarting from zero');
    partialSize = 0;
  } else if (partialSize > 0) {
    console.log(`  Resuming from ${formatSize(partialSize)} / ${formatSize(totalSize)}`);
  }

  const res = await request(
    host,
    port,
    ENDPOINTS.DOWNLOAD,
    remotePath,
    makeRangeHeader(partialSize),
  );

  if (res.statusCode !== 200 && res.statusCode !== 206) throw await responseError(res);

  if (res.statusCode === 206) {
    if (
      !validateContentRange(
        res.headers['content-range'],
        partialSize,
        totalSize - 1,
        totalSize,
      )
    ) {
      res.destroy();
      throw new Error('Server returned an invalid partial response');
    }
  } else if (partialSize > 0) {
    console.log('  Server ignored the resume request; restarting from zero');
    partialSize = 0;
  }

  console.log(`  Downloading: ${fileName} (${formatSize(totalSize)})`);
  const expectedBytes = totalSize - partialSize;
  const progress = new ProgressBar(totalSize, partialSize);
  let receivedBytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      receivedBytes += chunk.length;
      progress.update(chunk.length);
      callback(null, chunk);
    },
  });
  const output = createPartialWriteStream(localFile, partialSize > 0);
  const onSigint = () => interruptResponse(res);
  process.once('SIGINT', onSigint);

  try {
    await pipeline(res, meter, output);
  } finally {
    process.removeListener('SIGINT', onSigint);
  }

  if (receivedBytes !== expectedBytes) {
    throw new Error(`Incomplete transfer: received ${receivedBytes} of ${expectedBytes} bytes`);
  }

  progress.finish();
  finalize(localFile);
}

export async function cmdGetDir(host, port, remotePath, localDir) {
  console.log(`  Downloading directory: ${remotePath}`);
  const res = await request(host, port, ENDPOINTS.DOWNLOAD_DIR, remotePath);
  if (res.statusCode !== 200) throw await responseError(res);

  const totalSize = Number(res.headers['content-length']) || 0;
  const progress = totalSize > 0 ? new ProgressBar(totalSize) : null;
  const onSigint = () => interruptResponse(
    res,
    'Directory transfer interrupted; remove the incomplete extracted files before retrying',
  );
  process.once('SIGINT', onSigint);

  try {
    const result = await extractTarStream(res, localDir, {
      onChunk: (size) => progress?.update(size),
    });
    progress?.finish();
    console.log(`  Extracted ${result.filesExtracted} files to ${localDir}`);
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
