import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from '../lib/server/index.js';

const silentLogger = { log() {}, error() {} };

async function fixture(t) {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'neighbourhood-server-test-'));
  const rootDir = path.join(baseDir, 'share');
  const siblingDir = path.join(baseDir, 'share-secret');
  await mkdir(rootDir);
  await mkdir(siblingDir);
  await writeFile(path.join(rootDir, 'small.txt'), 'hello');
  await writeFile(path.join(rootDir, 'empty.txt'), '');
  await writeFile(path.join(siblingDir, 'secret.txt'), 'not-shared');

  const server = startServer(rootDir, 0, {
    host: '127.0.0.1',
    logger: silentLogger,
    manageSignals: false,
  });
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(baseDir, { recursive: true, force: true });
  });

  return { baseDir, rootDir, siblingDir, origin };
}

function apiUrl(origin, endpoint, requestedPath) {
  const url = new URL(endpoint, origin);
  url.searchParams.set('path', requestedPath);
  return url;
}

test('rejects traversal into a sibling whose name shares the root prefix', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/../share-secret/secret.txt'));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
});

test('rejects a symbolic link that resolves outside the shared root', async (t) => {
  const { origin, rootDir, siblingDir } = await fixture(t);
  try {
    await symlink(path.join(siblingDir, 'secret.txt'), path.join(rootDir, 'link.txt'));
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') return t.skip('symlinks unavailable');
    throw err;
  }

  const download = await fetch(apiUrl(origin, '/api/download', '/link.txt'));
  const listing = await fetch(apiUrl(origin, '/api/list', '/'));

  assert.equal(download.status, 403);
  assert.equal((await listing.json()).some((entry) => entry.name === 'link.txt'), false);
});

test('serves an empty file without hanging', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/empty.txt'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '0');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('supports HEAD for empty files', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/empty.txt'), { method: 'HEAD' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '0');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('clamps an oversized byte range to the file boundary', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/small.txt'), {
    headers: { Range: 'bytes=1-100' },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 1-4/5');
  assert.equal(response.headers.get('content-length'), '4');
  assert.equal(await response.text(), 'ello');
});

test('supports suffix byte ranges', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/small.txt'), {
    headers: { Range: 'bytes=-2' },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 3-4/5');
  assert.equal(await response.text(), 'lo');
});

for (const range of ['bytes=4-1', 'bytes=9-', 'bytes=0-1,3-4', 'items=0-1', 'bytes=-0']) {
  test(`rejects invalid range ${range}`, async (t) => {
    const { origin } = await fixture(t);
    const response = await fetch(apiUrl(origin, '/api/download', '/small.txt'), {
      headers: { Range: range },
    });

    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */5');
  });
}

test('rejects range requests against empty files', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/download', '/empty.txt'), {
    headers: { Range: 'bytes=0-' },
  });

  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */0');
});

test('rejects unsupported HTTP methods', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(apiUrl(origin, '/api/list', '/'), { method: 'POST' });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
