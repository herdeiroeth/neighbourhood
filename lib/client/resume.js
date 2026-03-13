import { stat } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { PART_SUFFIX } from '../shared/protocol.js';

export function partPath(filePath) {
  return filePath + PART_SUFFIX;
}

export async function getPartialSize(filePath) {
  try {
    const s = await stat(partPath(filePath));
    return s.size;
  } catch {
    return 0;
  }
}

export function makeRangeHeader(offset) {
  if (offset > 0) return { Range: `bytes=${offset}-` };
  return {};
}

export function finalize(filePath) {
  renameSync(partPath(filePath), filePath);
}
