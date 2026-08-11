import {
  constants,
  createWriteStream,
  linkSync,
  lstatSync,
  unlinkSync,
} from 'node:fs';
import { lstat } from 'node:fs/promises';
import { PART_SUFFIX } from '../shared/protocol.js';

export function partPath(filePath) {
  return filePath + PART_SUFFIX;
}

function unsafePartialError(filePath) {
  const error = new Error(`Partial download is not a regular file: ${filePath}`);
  error.code = 'EUNSAFEPART';
  return error;
}

export async function getPartialSize(filePath) {
  try {
    const partialStat = await lstat(partPath(filePath));
    if (!partialStat.isFile()) throw unsafePartialError(partPath(filePath));
    return partialStat.size;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

export function makeRangeHeader(offset) {
  if (offset > 0) return { Range: `bytes=${offset}-` };
  return {};
}

export function createPartialWriteStream(filePath, append) {
  const flags = constants.O_WRONLY |
    constants.O_CREAT |
    (append ? constants.O_APPEND : constants.O_TRUNC) |
    (constants.O_NOFOLLOW || 0);

  return createWriteStream(partPath(filePath), {
    flags,
    mode: 0o600,
  });
}

export function finalize(filePath) {
  const partial = partPath(filePath);
  const partialStat = lstatSync(partial);
  if (!partialStat.isFile()) throw unsafePartialError(partial);

  // Linking is atomic and exclusive: if the destination already exists,
  // linkSync fails with EEXIST and the partial download remains untouched.
  linkSync(partial, filePath);
  try {
    unlinkSync(partial);
  } catch (err) {
    // Roll back the newly created destination if cleanup fails. The partial
    // file remains available for recovery or a later retry.
    try {
      unlinkSync(filePath);
    } catch {
      // Preserve the original cleanup error; it best describes the failure.
    }
    throw err;
  }
}
