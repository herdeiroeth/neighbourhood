import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createTarStream } from './tar-stream.js';

function isWithinRoot(rootDir, targetPath) {
  const relative = path.relative(rootDir, targetPath);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function safePath(rootDir, requestedPath) {
  const normalized = String(requestedPath || '/')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (normalized.includes('\0')) return null;

  const candidate = path.resolve(rootDir, normalized);
  if (!isWithinRoot(rootDir, candidate)) return null;

  const canonical = await realpath(candidate);
  return isWithinRoot(rootDir, canonical) ? canonical : null;
}

function sendJson(res, data, status = 200, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function sendError(res, status, message, headers = {}) {
  sendJson(res, { error: message }, status, headers);
}

function sendFsError(res, err) {
  if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
    return sendError(res, 404, 'Not found');
  }
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return sendError(res, 403, 'Access denied');
  }
  return sendError(res, 500, 'Internal server error');
}

function parseRange(rangeHeader, totalSize) {
  if (!rangeHeader) return null;
  if (typeof rangeHeader !== 'string' || totalSize === 0) return false;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return false;

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalSize - 1;

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
    if (start >= totalSize || end < start) return false;
    end = Math.min(end, totalSize - 1);
  }

  return { start, end };
}

export async function handleList(req, res, rootDir, requestedPath) {
  try {
    const fullPath = await safePath(rootDir, requestedPath);
    if (!fullPath) return sendError(res, 403, 'Forbidden');

    const entries = await readdir(fullPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      try {
        const entryPath = path.join(fullPath, entry.name);
        const entryStat = await lstat(entryPath);

        // Symbolic links are intentionally omitted. Following them would make
        // the shared-root boundary depend on mutable filesystem state.
        if (entryStat.isSymbolicLink()) continue;
        if (!entryStat.isDirectory() && !entryStat.isFile()) continue;

        items.push({
          name: entry.name,
          type: entryStat.isDirectory() ? 'dir' : 'file',
          size: entryStat.size,
          mtime: entryStat.mtime.toISOString(),
        });
      } catch {
        // An entry can disappear or become inaccessible between readdir/lstat.
      }
    }

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return sendJson(res, items);
  } catch (err) {
    return sendFsError(res, err);
  }
}

export async function handleStat(req, res, rootDir, requestedPath) {
  try {
    const fullPath = await safePath(rootDir, requestedPath);
    if (!fullPath) return sendError(res, 403, 'Forbidden');

    const fileStat = await stat(fullPath);
    return sendJson(res, {
      name: path.basename(fullPath),
      type: fileStat.isDirectory() ? 'dir' : 'file',
      size: fileStat.size,
      mtime: fileStat.mtime.toISOString(),
    });
  } catch (err) {
    return sendFsError(res, err);
  }
}

export async function handleDownload(req, res, rootDir, requestedPath) {
  try {
    const fullPath = await safePath(rootDir, requestedPath);
    if (!fullPath) return sendError(res, 403, 'Forbidden');

    const fileStat = await stat(fullPath);
    if (fileStat.isDirectory()) {
      return sendError(res, 400, 'Use /api/download-dir for directories');
    }
    if (!fileStat.isFile()) return sendError(res, 400, 'Not a regular file');

    const totalSize = fileStat.size;
    const requestedRange = parseRange(req.headers.range, totalSize);

    if (requestedRange === false) {
      return sendError(res, 416, 'Range not satisfiable', {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${totalSize}`,
      });
    }

    const start = requestedRange?.start ?? 0;
    const end = requestedRange?.end ?? Math.max(totalSize - 1, 0);
    const statusCode = requestedRange ? 206 : 200;
    const contentLength = totalSize === 0 ? 0 : end - start + 1;
    const encodedName = encodeURIComponent(path.basename(fullPath));
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Content-Length': contentLength,
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    };

    if (requestedRange) {
      headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
    }

    res.writeHead(statusCode, headers);
    if (req.method === 'HEAD' || totalSize === 0) return res.end();

    const stream = createReadStream(fullPath, { start, end });
    stream.on('error', (err) => {
      console.error(`Stream error: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    if (res.headersSent) return res.destroy(err);
    return sendFsError(res, err);
  }
}

export async function handleDownloadDir(req, res, rootDir, requestedPath) {
  try {
    const fullPath = await safePath(rootDir, requestedPath);
    if (!fullPath) return sendError(res, 403, 'Forbidden');

    const directoryStat = await stat(fullPath);
    if (!directoryStat.isDirectory()) return sendError(res, 400, 'Not a directory');

    const directoryName = path.basename(fullPath) || 'root';
    const { stream, totalSize } = await createTarStream(fullPath, directoryName);
    const encodedName = encodeURIComponent(directoryName);

    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}.tar`,
      'Content-Length': totalSize,
      'Content-Type': 'application/x-tar',
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.method === 'HEAD') return res.end();

    stream.on('error', (err) => {
      console.error(`Tar stream error: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    if (res.headersSent) return res.destroy(err);
    return sendFsError(res, err);
  }
}
