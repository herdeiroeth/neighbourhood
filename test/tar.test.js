import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractTarStream } from '../lib/client/tar-extractor.js';
import { createTarStream, TAR_BLOCK_SIZE } from '../lib/server/tar-stream.js';

async function collect(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function rechunk(buffer) {
  const sizes = [TAR_BLOCK_SIZE, 1, 17, 493, 2, 509, 7, 64];
  const chunks = [];
  let offset = 0;
  let index = 0;
  while (offset < buffer.length) {
    const end = Math.min(buffer.length, offset + sizes[index % sizes.length]);
    chunks.push(buffer.subarray(offset, end));
    offset = end;
    index++;
  }
  return Readable.from(chunks);
}

function updateChecksum(header) {
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
}

async function tarFixture(t) {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'neighbourhood-tar-test-'));
  const sourceDir = path.join(baseDir, 'source');
  const destinationDir = path.join(baseDir, 'destination');
  await mkdir(path.join(sourceDir, 'nested'), { recursive: true });
  await mkdir(path.join(sourceDir, 'empty-directory'));
  await mkdir(destinationDir);
  await writeFile(path.join(sourceDir, 'one-byte.txt'), 'x');
  await writeFile(path.join(sourceDir, 'empty.txt'), '');
  await writeFile(path.join(sourceDir, 'nested', 'message.txt'), 'hello from tar');

  t.after(() => rm(baseDir, { recursive: true, force: true }));
  return { baseDir, sourceDir, destinationDir };
}

test('creates POSIX ustar and extracts files across arbitrary chunk boundaries', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  const { stream, totalSize } = await createTarStream(sourceDir, 'source');
  const archive = await collect(stream);

  assert.equal(archive.length, totalSize);
  assert.equal(archive.toString('ascii', 257, 263), 'ustar\0');

  const result = await extractTarStream(rechunk(archive), destinationDir);
  assert.equal(result.filesExtracted, 3);
  assert.equal(await readFile(path.join(destinationDir, 'source', 'one-byte.txt'), 'utf8'), 'x');
  assert.equal(await readFile(path.join(destinationDir, 'source', 'empty.txt'), 'utf8'), '');
  assert.equal(
    await readFile(path.join(destinationDir, 'source', 'nested', 'message.txt'), 'utf8'),
    'hello from tar',
  );
  assert.equal((await lstat(path.join(destinationDir, 'source', 'empty-directory'))).isDirectory(), true);
});

test('does not archive symbolic links', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  try {
    await symlink(path.join(sourceDir, 'one-byte.txt'), path.join(sourceDir, 'linked.txt'));
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') return t.skip('symlinks unavailable');
    throw err;
  }

  const { stream } = await createTarStream(sourceDir, 'source');
  await extractTarStream(stream, destinationDir);
  await assert.rejects(lstat(path.join(destinationDir, 'source', 'linked.txt')), { code: 'ENOENT' });
});

test('rejects traversal paths from a malicious archive', async (t) => {
  const { sourceDir, destinationDir, baseDir } = await tarFixture(t);
  const { stream } = await createTarStream(sourceDir, 'source');
  const archive = await collect(stream);

  // The first header is the root directory; the second is its first sorted entry.
  const maliciousHeader = archive.subarray(TAR_BLOCK_SIZE, TAR_BLOCK_SIZE * 2);
  maliciousHeader.fill(0, 0, 100);
  maliciousHeader.write('../escape.txt', 0, 'utf8');
  maliciousHeader.write('0', 156, 1, 'ascii');
  updateChecksum(maliciousHeader);

  await assert.rejects(
    extractTarStream(Readable.from([archive]), destinationDir),
    /Unsafe TAR entry path/,
  );
  await assert.rejects(lstat(path.join(baseDir, 'escape.txt')), { code: 'ENOENT' });
});

test('rejects archive names that are unsafe on supported platforms', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  const { stream } = await createTarStream(sourceDir, 'source');
  const validArchive = await collect(stream);

  for (const unsafeName of ['source/CON.txt', 'source/report.txt:payload', 'source/trailing.']) {
    const archive = Buffer.from(validArchive);
    const maliciousHeader = archive.subarray(TAR_BLOCK_SIZE, TAR_BLOCK_SIZE * 2);
    maliciousHeader.fill(0, 0, 100);
    maliciousHeader.write(unsafeName, 0, 'utf8');
    maliciousHeader.write('0', 156, 1, 'ascii');
    updateChecksum(maliciousHeader);

    await assert.rejects(
      extractTarStream(Readable.from([archive]), destinationDir),
      /Unsafe TAR entry path/,
    );
  }
});

test('rejects extraction through a pre-existing symbolic-link directory', async (t) => {
  const { sourceDir, destinationDir, baseDir } = await tarFixture(t);
  const outsideDir = path.join(baseDir, 'outside');
  await mkdir(outsideDir);
  try {
    await symlink(outsideDir, path.join(destinationDir, 'source'), 'dir');
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') return t.skip('symlinks unavailable');
    throw err;
  }

  const { stream } = await createTarStream(sourceDir, 'source');
  await assert.rejects(extractTarStream(stream, destinationDir), /not a safe directory/);
  await assert.rejects(lstat(path.join(outsideDir, 'one-byte.txt')), { code: 'ENOENT' });
});

test('rejects an invalid TAR checksum', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  const { stream } = await createTarStream(sourceDir, 'source');
  const archive = await collect(stream);
  archive[0] ^= 0xff;

  await assert.rejects(
    extractTarStream(Readable.from([archive]), destinationDir),
    /checksum/,
  );
});

test('rejects a truncated TAR archive', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  const { stream } = await createTarStream(sourceDir, 'source');
  const archive = await collect(stream);
  const truncated = archive.subarray(0, archive.length - TAR_BLOCK_SIZE * 2);

  await assert.rejects(
    extractTarStream(rechunk(truncated), destinationDir),
    /Truncated TAR archive/,
  );
});

test('does not overwrite an existing extracted file', async (t) => {
  const { sourceDir, destinationDir } = await tarFixture(t);
  await mkdir(path.join(destinationDir, 'source'));
  await writeFile(path.join(destinationDir, 'source', 'one-byte.txt'), 'keep-me');
  const { stream } = await createTarStream(sourceDir, 'source');

  await assert.rejects(extractTarStream(stream, destinationDir), { code: 'EEXIST' });
  assert.equal(
    await readFile(path.join(destinationDir, 'source', 'one-byte.txt'), 'utf8'),
    'keep-me',
  );
});
