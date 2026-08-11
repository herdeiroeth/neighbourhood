import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cmdGet } from '../lib/client/commands.js';

async function withDownloadServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

async function destinationFixture(t) {
  const destination = await mkdtemp(path.join(tmpdir(), 'neighbourhood-client-test-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  return destination;
}

function sendJson(res, value) {
  const body = JSON.stringify(value);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

test('restarts safely when a server ignores a resume Range header', async (t) => {
  const destination = await destinationFixture(t);
  const payload = Buffer.from('abcdef');
  let observedRange;
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: 'file.txt', type: 'file', size: payload.length });
    }

    observedRange = req.headers.range;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
    });
    return res.end(payload);
  });
  await writeFile(path.join(destination, 'file.txt.part'), 'abc');

  await cmdGet('127.0.0.1', port, '/file.txt', destination);

  assert.equal(observedRange, 'bytes=3-');
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'abcdef');
});

test('rejects a partial response with an inconsistent Content-Range', async (t) => {
  const destination = await destinationFixture(t);
  const payload = Buffer.from('def');
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: 'file.txt', type: 'file', size: 6 });
    }

    res.writeHead(206, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
      'Content-Range': 'bytes 2-4/6',
    });
    return res.end(payload);
  });
  const partialPath = path.join(destination, 'file.txt.part');
  await writeFile(partialPath, 'abc');

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    /invalid partial response/,
  );
  assert.equal(await readFile(partialPath, 'utf8'), 'abc');
});

test('restarts instead of accepting a partial file larger than the source', async (t) => {
  const destination = await destinationFixture(t);
  const payload = Buffer.from('new');
  let observedRange;
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: 'file.txt', type: 'file', size: payload.length });
    }

    observedRange = req.headers.range;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
    });
    return res.end(payload);
  });
  await writeFile(path.join(destination, 'file.txt.part'), 'stale-content');

  await cmdGet('127.0.0.1', port, '/file.txt', destination);

  assert.equal(observedRange, undefined);
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'new');
});

test('restarts instead of trusting an unverifiable same-size partial file', async (t) => {
  const destination = await destinationFixture(t);
  const payload = Buffer.from('good');
  let observedRange;
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: 'file.txt', type: 'file', size: payload.length });
    }

    observedRange = req.headers.range;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
    });
    return res.end(payload);
  });
  await writeFile(path.join(destination, 'file.txt.part'), 'evil');

  await cmdGet('127.0.0.1', port, '/file.txt', destination);

  assert.equal(observedRange, undefined);
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'good');
});

test('rejects a file name supplied by a malicious server that escapes the destination', async (t) => {
  const destination = await destinationFixture(t);
  const escapeName = `escape-${path.basename(destination)}.txt`;
  const escapedPath = path.join(path.dirname(destination), escapeName);
  let downloadRequested = false;
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: `../${escapeName}`, type: 'file', size: 4 });
    }
    downloadRequested = true;
    return res.end('evil');
  });

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    /unsafe file name/,
  );
  assert.equal(downloadRequested, false);
  await assert.rejects(lstat(escapedPath), { code: 'ENOENT' });
});

test('rejects invalid file metadata supplied by the server', async (t) => {
  const destination = await destinationFixture(t);
  const port = await withDownloadServer(t, (req, res) => {
    return sendJson(res, { name: 'file.txt', type: 'file', size: -1 });
  });

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    /invalid file size/,
  );
});

test('rejects Windows-reserved file names on every client platform', async (t) => {
  const destination = await destinationFixture(t);
  const port = await withDownloadServer(t, (req, res) => {
    return sendJson(res, { name: 'file.txt:stream', type: 'file', size: 1 });
  });

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    /unsafe file name/,
  );
});

test('does not replace an existing destination file', async (t) => {
  const destination = await destinationFixture(t);
  const payload = Buffer.from('new-content');
  const port = await withDownloadServer(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/stat') {
      return sendJson(res, { name: 'file.txt', type: 'file', size: payload.length });
    }
    res.writeHead(200, { 'Content-Length': payload.length });
    return res.end(payload);
  });
  await writeFile(path.join(destination, 'file.txt'), 'keep-me');

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    { code: 'EEXIST' },
  );
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'keep-me');
  assert.equal(await readFile(path.join(destination, 'file.txt.part'), 'utf8'), 'new-content');
});

test('rejects a symbolic-link partial file without writing through it', async (t) => {
  const destination = await destinationFixture(t);
  const outsideFile = path.join(
    path.dirname(destination),
    `${path.basename(destination)}-outside`,
  );
  await writeFile(outsideFile, 'keep-me');
  t.after(() => rm(outsideFile, { force: true }));
  try {
    await symlink(outsideFile, path.join(destination, 'file.txt.part'));
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') return t.skip('symlinks unavailable');
    throw err;
  }
  const port = await withDownloadServer(t, (req, res) => {
    return sendJson(res, { name: 'file.txt', type: 'file', size: 4 });
  });

  await assert.rejects(
    cmdGet('127.0.0.1', port, '/file.txt', destination),
    /not a regular file/,
  );
  assert.equal(await readFile(outsideFile, 'utf8'), 'keep-me');
});
