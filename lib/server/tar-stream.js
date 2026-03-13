import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const BLOCK_SIZE = 512;

function createHeader(fileName, fileSize, mtime) {
  const buf = Buffer.alloc(BLOCK_SIZE);
  const name = fileName.length <= 100 ? fileName : fileName.slice(-100);

  buf.write(name, 0, 100);                          // name
  buf.write('0000644\0', 100, 8);                    // mode
  buf.write('0001000\0', 108, 8);                    // uid
  buf.write('0001000\0', 116, 8);                    // gid
  buf.write(fileSize.toString(8).padStart(11, '0') + '\0', 124, 12); // size
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136, 12); // mtime
  buf.write('        ', 148, 8);                     // checksum placeholder (spaces)
  buf.write('0', 156, 1);                            // typeflag: regular file

  // Calculate checksum
  let checksum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) checksum += buf[i];
  buf.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);

  return buf;
}

async function walkDir(dirPath, prefix) {
  const entries = [];
  let items;
  try {
    items = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const entryName = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      const subEntries = await walkDir(fullPath, entryName);
      entries.push(...subEntries);
    } else if (item.isFile()) {
      try {
        const s = await stat(fullPath);
        entries.push({ fullPath, name: entryName, size: s.size, mtime: s.mtimeMs });
      } catch {
        // Skip inaccessible files
      }
    }
  }
  return entries;
}

async function* tarGenerator(files) {
  for (const file of files) {
    // Emit header
    yield createHeader(file.name, file.size, file.mtime);

    // Stream file content
    if (file.size > 0) {
      const rs = createReadStream(file.fullPath);
      for await (const chunk of rs) {
        yield chunk;
      }
    }

    // Padding to align to BLOCK_SIZE
    const padding = (BLOCK_SIZE - (file.size % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding > 0) {
      yield Buffer.alloc(padding);
    }
  }

  // End-of-archive: two zero blocks
  yield Buffer.alloc(BLOCK_SIZE * 2);
}

export async function createTarStream(dirPath, baseName) {
  const files = await walkDir(dirPath, baseName);

  // Calculate total tar size
  let totalSize = 0;
  for (const f of files) {
    totalSize += BLOCK_SIZE; // header
    totalSize += f.size;
    const padding = (BLOCK_SIZE - (f.size % BLOCK_SIZE)) % BLOCK_SIZE;
    totalSize += padding;
  }
  totalSize += BLOCK_SIZE * 2; // end-of-archive marker

  const stream = Readable.from(tarGenerator(files));

  return { stream, totalSize };
}
