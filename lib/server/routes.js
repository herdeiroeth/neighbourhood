import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createTarStream } from './tar-stream.js';

function safePath(rootDir, relativePath) {
  const cleaned = (relativePath || '/').replace(/\\/g, '/');
  const resolved = path.resolve(rootDir, '.' + cleaned);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, { error: message }, status);
}

export async function handleList(req, res, rootDir, relativePath) {
  const fullPath = safePath(rootDir, relativePath);
  if (!fullPath) return sendError(res, 403, 'Forbidden');

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      try {
        const entryPath = path.join(fullPath, entry.name);
        const s = await stat(entryPath);
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          size: s.size,
          mtime: s.mtime.toISOString(),
        });
      } catch {
        // Skip inaccessible entries
      }
    }

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    sendJson(res, items);
  } catch (err) {
    if (err.code === 'ENOENT') return sendError(res, 404, 'Not found');
    if (err.code === 'EACCES') return sendError(res, 403, 'Access denied');
    sendError(res, 500, err.message);
  }
}

export async function handleStat(req, res, rootDir, relativePath) {
  const fullPath = safePath(rootDir, relativePath);
  if (!fullPath) return sendError(res, 403, 'Forbidden');

  try {
    const s = await stat(fullPath);
    sendJson(res, {
      name: path.basename(fullPath),
      type: s.isDirectory() ? 'dir' : 'file',
      size: s.size,
      mtime: s.mtime.toISOString(),
    });
  } catch (err) {
    if (err.code === 'ENOENT') return sendError(res, 404, 'Not found');
    sendError(res, 500, err.message);
  }
}

export async function handleDownload(req, res, rootDir, relativePath) {
  const fullPath = safePath(rootDir, relativePath);
  if (!fullPath) return sendError(res, 403, 'Forbidden');

  try {
    const s = await stat(fullPath);
    if (s.isDirectory()) return sendError(res, 400, 'Use /api/download-dir for directories');

    const totalSize = s.size;
    const rangeHeader = req.headers['range'];
    let start = 0;
    let end = totalSize - 1;
    let statusCode = 200;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        start = parseInt(match[1], 10);
        if (match[2]) end = parseInt(match[2], 10);
        if (start >= totalSize) return sendError(res, 416, 'Range not satisfiable');
        statusCode = 206;
      }
    }

    const contentLength = end - start + 1;
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': contentLength,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(fullPath))}"`,
    };

    if (statusCode === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
    }

    res.writeHead(statusCode, headers);

    if (req.method === 'HEAD') return res.end();

    const stream = createReadStream(fullPath, { start, end });
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error(`Stream error: ${err.message}`);
      res.destroy();
    });
  } catch (err) {
    if (err.code === 'ENOENT') return sendError(res, 404, 'Not found');
    sendError(res, 500, err.message);
  }
}

export async function handleDownloadDir(req, res, rootDir, relativePath) {
  const fullPath = safePath(rootDir, relativePath);
  if (!fullPath) return sendError(res, 403, 'Forbidden');

  try {
    const s = await stat(fullPath);
    if (!s.isDirectory()) return sendError(res, 400, 'Not a directory');

    const dirName = path.basename(fullPath) || 'root';
    const { stream, totalSize } = await createTarStream(fullPath, dirName);

    const headers = {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(dirName)}.tar"`,
    };
    if (totalSize > 0) {
      headers['Content-Length'] = totalSize;
    }

    res.writeHead(200, headers);
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error(`Tar stream error: ${err.message}`);
      res.destroy();
    });
  } catch (err) {
    if (err.code === 'ENOENT') return sendError(res, 404, 'Not found');
    sendError(res, 500, err.message);
  }
}
