#!/usr/bin/env node

import path from 'node:path';
import { startServer } from '../lib/server/index.js';
import { DEFAULT_PORT } from '../lib/shared/protocol.js';

function usage() {
  console.log(`neighbourhood-server

Usage:
  neighbourhood-server [directory] [--host address] [--port number]

Options:
  --host <address>  Interface to bind (default: 0.0.0.0)
  --port <number>   TCP port (default: 3000 or PORT)
  -h, --help        Show this help
`);
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parseArguments(argv) {
  const args = argv.slice(2);
  let rootDir = process.cwd();
  let rootProvided = false;
  let host = '0.0.0.0';
  let port = process.env.PORT === undefined ? DEFAULT_PORT : parsePort(process.env.PORT);

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === '-h' || argument === '--help') return { help: true };
    if (argument === '--port' || argument === '--host') {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--port') port = parsePort(value);
      if (argument === '--host') host = value;
      index++;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    if (rootProvided) throw new Error('Only one shared directory may be specified');

    rootDir = path.resolve(argument);
    rootProvided = true;
  }

  return { help: false, rootDir, host, port };
}

try {
  const options = parseArguments(process.argv);
  if (options.help) {
    usage();
  } else {
    const server = startServer(options.rootDir, options.port, { host: options.host });
    server.on('error', (err) => {
      console.error(`Server error: ${err.message}`);
      process.exitCode = 1;
    });
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
