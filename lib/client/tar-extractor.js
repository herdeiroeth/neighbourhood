import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { TAR_BLOCK_SIZE } from '../server/tar-stream.js';

function isWithinRoot(rootDir, targetPath) {
  const relative = path.relative(
    path.toNamespacedPath(rootDir),
    path.toNamespacedPath(targetPath),
  );
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function readString(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const nullIndex = field.indexOf(0);
  return field.subarray(0, nullIndex === -1 ? field.length : nullIndex).toString('utf8');
}

function readOctal(buffer, offset, length, fieldName) {
  const value = readString(buffer, offset, length).trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) throw new Error(`Invalid TAR ${fieldName}`);

  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) throw new Error(`TAR ${fieldName} exceeds the safe limit`);
  return number;
}

function parseHeader(header) {
  const storedChecksum = readOctal(header, 148, 8, 'checksum');
  const checksumBuffer = Buffer.from(header);
  checksumBuffer.fill(0x20, 148, 156);
  let calculatedChecksum = 0;
  for (const byte of checksumBuffer) calculatedChecksum += byte;
  if (storedChecksum !== calculatedChecksum) throw new Error('Invalid TAR header checksum');

  if (readString(header, 257, 6) !== 'ustar') {
    throw new Error('Unsupported TAR format (POSIX ustar required)');
  }

  const name = readString(header, 0, 100);
  const prefix = readString(header, 345, 155);
  const archivePath = prefix ? `${prefix}/${name}` : name;
  const size = readOctal(header, 124, 12, 'size');
  const mode = readOctal(header, 100, 8, 'mode');
  const typeFlag = readString(header, 156, 1) || '0';

  if (!archivePath) throw new Error('TAR entry has no path');
  if (typeFlag !== '0' && typeFlag !== '5') {
    throw new Error(`Unsupported TAR entry type: ${typeFlag}`);
  }
  if (typeFlag === '5' && size !== 0) throw new Error('TAR directory entry has a payload');

  return {
    archivePath,
    mode,
    size,
    type: typeFlag === '5' ? 'directory' : 'file',
  };
}

function safeDestination(rootDir, archivePath) {
  if (
    archivePath.includes('\0') ||
    archivePath.includes('\\') ||
    archivePath.startsWith('/')
  ) {
    throw new Error(`Unsafe TAR entry path: ${archivePath}`);
  }

  const normalized = archivePath.replace(/\/$/, '');
  const parts = normalized.split('/');
  if (
    parts.some((part) => (
      !part ||
      part === '.' ||
      part === '..' ||
      /[<>:"|?*\u0000-\u001f]/.test(part) ||
      /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )) ||
    /^[A-Za-z]:/.test(parts[0])
  ) {
    throw new Error(`Unsafe TAR entry path: ${archivePath}`);
  }

  const destination = path.resolve(rootDir, ...parts);
  if (!isWithinRoot(rootDir, destination)) {
    throw new Error(`TAR entry escapes the destination: ${archivePath}`);
  }
  return { destination, parts };
}

async function ensureDirectoryChain(rootDir, parts) {
  let currentPath = rootDir;

  for (const part of parts) {
    currentPath = path.join(currentPath, part);
    try {
      const entryStat = await lstat(currentPath);
      if (entryStat.isSymbolicLink() || !entryStat.isDirectory()) {
        throw new Error(`Extraction path is not a safe directory: ${currentPath}`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await mkdir(currentPath);
    }
  }
}

async function writeAll(fileHandle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await fileHandle.write(buffer, offset, buffer.length - offset);
    if (bytesWritten === 0) throw new Error('Could not write extracted file');
    offset += bytesWritten;
  }
}

function isZeroBlock(block) {
  return block.every((byte) => byte === 0);
}

export async function extractTarStream(readable, destinationDir, options = {}) {
  const { onChunk = () => {} } = options;
  await mkdir(destinationDir, { recursive: true });
  const destinationRoot = await realpath(destinationDir);

  let buffer = Buffer.alloc(0);
  let currentFile = null;
  let paddingRemaining = 0;
  let zeroBlocks = 0;
  let archiveEnded = false;
  let filesExtracted = 0;

  try {
    for await (const incomingChunk of readable) {
      const chunk = Buffer.from(incomingChunk);
      onChunk(chunk.length);

      if (archiveEnded) {
        if (!isZeroBlock(chunk)) throw new Error('Unexpected data after the TAR end marker');
        continue;
      }

      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

      while (buffer.length > 0) {
        if (currentFile) {
          if (currentFile.bytesRemaining > 0) {
            const writeLength = Math.min(buffer.length, currentFile.bytesRemaining);
            await writeAll(currentFile.handle, buffer.subarray(0, writeLength));
            buffer = buffer.subarray(writeLength);
            currentFile.bytesRemaining -= writeLength;
            if (currentFile.bytesRemaining > 0) break;
          }

          await currentFile.handle.close();
          currentFile.handle = null;
          filesExtracted++;
          paddingRemaining = (TAR_BLOCK_SIZE - (currentFile.size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
          currentFile = null;
        }

        if (paddingRemaining > 0) {
          const paddingLength = Math.min(buffer.length, paddingRemaining);
          const padding = buffer.subarray(0, paddingLength);
          if (!isZeroBlock(padding)) throw new Error('Invalid non-zero TAR padding');
          buffer = buffer.subarray(paddingLength);
          paddingRemaining -= paddingLength;
          if (paddingRemaining > 0) break;
          continue;
        }

        if (buffer.length < TAR_BLOCK_SIZE) break;
        const headerBuffer = buffer.subarray(0, TAR_BLOCK_SIZE);
        buffer = buffer.subarray(TAR_BLOCK_SIZE);

        if (isZeroBlock(headerBuffer)) {
          zeroBlocks++;
          if (zeroBlocks === 2) {
            archiveEnded = true;
            if (buffer.length > 0 && !isZeroBlock(buffer)) {
              throw new Error('Unexpected data after the TAR end marker');
            }
            buffer = Buffer.alloc(0);
          }
          continue;
        }
        if (zeroBlocks > 0) throw new Error('Incomplete TAR end marker');

        const header = parseHeader(headerBuffer);
        const target = safeDestination(destinationRoot, header.archivePath);

        if (header.type === 'directory') {
          await ensureDirectoryChain(destinationRoot, target.parts);
          continue;
        }

        await ensureDirectoryChain(destinationRoot, target.parts.slice(0, -1));
        const flags = constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          (constants.O_NOFOLLOW || 0);
        const handle = await open(target.destination, flags, header.mode || 0o600);
        currentFile = {
          handle,
          path: target.destination,
          size: header.size,
          bytesRemaining: header.size,
        };
      }
    }

    if (currentFile || paddingRemaining > 0 || buffer.length > 0 || !archiveEnded) {
      throw new Error('Truncated TAR archive');
    }

    return { filesExtracted };
  } catch (err) {
    if (currentFile?.handle) await currentFile.handle.close().catch(() => {});
    if (currentFile?.path) await unlink(currentFile.path).catch(() => {});
    throw err;
  }
}
