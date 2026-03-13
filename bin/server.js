#!/usr/bin/env node

import path from 'node:path';
import { startServer } from '../lib/server/index.js';
import { DEFAULT_PORT } from '../lib/shared/protocol.js';

const args = process.argv.slice(2);
let rootDir = process.cwd();
let port = DEFAULT_PORT;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('-')) {
    rootDir = path.resolve(args[i]);
  }
}

console.log(`Starting trans-server...`);
startServer(rootDir, port);
