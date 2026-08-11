import { lstat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export const TAR_BLOCK_SIZE = 512;
const TAR_NAME_BYTES = 100;
const TAR_PREFIX_BYTES = 155;

function normalizeArchiveName(value) {
  const name = String(value).replace(/\/$/, '');
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/')) {
    throw new Error(`Unsupported archive path: ${JSON.stringify(value)}`);
  }

  const parts = name.split('/');
  if (parts.some((part) => (
    !part ||
    part === '.' ||
    part === '..' ||
    /[<>:"|?*\u0000-\u001f]/.test(part) ||
    /[. ]$/.test(part) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  ))) {
    throw new Error(`Unsafe archive path: ${JSON.stringify(value)}`);
  }
  return parts.join('/');
}

function splitArchiveName(value) {
  const name = normalizeArchiveName(value);
  if (Buffer.byteLength(name) <= TAR_NAME_BYTES) return { name, prefix: '' };

  for (let index = name.lastIndexOf('/'); index > 0; index = name.lastIndexOf('/', index - 1)) {
    const prefix = name.slice(0, index);
    const baseName = name.slice(index + 1);
    if (
      Buffer.byteLength(prefix) <= TAR_PREFIX_BYTES &&
      Buffer.byteLength(baseName) <= TAR_NAME_BYTES
    ) {
      return { name: baseName, prefix };
    }
  }

  throw new Error(`Archive path exceeds the POSIX ustar limit: ${value}`);
}

function writeString(buffer, value, offset, length) {
  const encoded = Buffer.from(value);
  if (encoded.length > length) throw new Error(`TAR field exceeds ${length} bytes`);
  encoded.copy(buffer, offset);
}

function writeOctal(buffer, value, offset, length) {
  const integer = Math.trunc(value);
  if (!Number.isSafeInteger(integer) || integer < 0) {
    throw new Error(`Invalid TAR numeric field: ${value}`);
  }

  const encoded = integer.toString(8);
  if (encoded.length > length - 1) throw new Error(`TAR numeric field is too large: ${value}`);
  buffer.write(`${encoded.padStart(length - 1, '0')}\0`, offset, length, 'ascii');
}

function createHeader(entry) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  const archivePath = splitArchiveName(entry.name);

  writeString(header, archivePath.name, 0, TAR_NAME_BYTES);
  writeOctal(header, entry.mode & 0o777, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, entry.type === 'file' ? entry.size : 0, 124, 12);
  writeOctal(header, Math.floor(entry.mtimeMs / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header.write(entry.type === 'directory' ? '5' : '0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  writeString(header, 'neighbourhood', 265, 32);
  writeString(header, 'neighbourhood', 297, 32);
  if (archivePath.prefix) writeString(header, archivePath.prefix, 345, TAR_PREFIX_BYTES);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const encodedChecksum = checksum.toString(8).padStart(6, '0');
  header.write(`${encodedChecksum}\0 `, 148, 8, 'ascii');

  return header;
}

async function collectEntries(directoryPath, archiveName, entries) {
  const directoryStat = await lstat(directoryPath);
  entries.push({
    fullPath: directoryPath,
    name: normalizeArchiveName(archiveName),
    type: 'directory',
    size: 0,
    mode: directoryStat.mode,
    mtimeMs: directoryStat.mtimeMs,
  });

  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  directoryEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const directoryEntry of directoryEntries) {
    const fullPath = path.join(directoryPath, directoryEntry.name);
    const entryStat = await lstat(fullPath);
    const entryName = `${archiveName}/${directoryEntry.name}`;

    // Links and special files are excluded from the transfer by design.
    if (entryStat.isSymbolicLink()) continue;
    if (entryStat.isDirectory()) {
      await collectEntries(fullPath, entryName, entries);
      continue;
    }
    if (!entryStat.isFile()) continue;

    entries.push({
      fullPath,
      name: normalizeArchiveName(entryName),
      type: 'file',
      size: entryStat.size,
      mode: entryStat.mode,
      mtimeMs: entryStat.mtimeMs,
    });
  }
}

async function* tarGenerator(entries) {
  for (const entry of entries) {
    yield createHeader(entry);
    if (entry.type === 'directory') continue;

    let bytesRead = 0;
    if (entry.size > 0) {
      const stream = createReadStream(entry.fullPath, { start: 0, end: entry.size - 1 });
      for await (const chunk of stream) {
        bytesRead += chunk.length;
        yield chunk;
      }
    }

    if (bytesRead !== entry.size) {
      throw new Error(`File changed during archive creation: ${entry.name}`);
    }

    const padding = (TAR_BLOCK_SIZE - (entry.size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding > 0) yield Buffer.alloc(padding);
  }

  yield Buffer.alloc(TAR_BLOCK_SIZE * 2);
}

export async function createTarStream(directoryPath, baseName) {
  const entries = [];
  await collectEntries(directoryPath, normalizeArchiveName(baseName), entries);

  let totalSize = TAR_BLOCK_SIZE * 2;
  for (const entry of entries) {
    // Build once here so unsupported names and numeric limits fail before the
    // HTTP response headers are sent.
    createHeader(entry);
    totalSize += TAR_BLOCK_SIZE;
    if (entry.type === 'file') {
      totalSize += entry.size;
      totalSize += (TAR_BLOCK_SIZE - (entry.size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    }
  }

  return {
    stream: Readable.from(tarGenerator(entries)),
    totalSize,
  };
}
