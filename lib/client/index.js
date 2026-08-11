import { cmdList, cmdGet, cmdGetDir } from './commands.js';

function usage() {
  console.log(`neighbourhood-client

Usage:
  neighbourhood-client <host:port> list [path]
  neighbourhood-client <host:port> get <remote-path>
  neighbourhood-client <host:port> get-dir <remote-path>

Examples:
  neighbourhood-client 192.168.1.10:3000 list /
  neighbourhood-client 192.168.1.10:3000 get /photos/archive.zip
  neighbourhood-client 192.168.1.10:3000 get-dir /Documents
`);
}

function parseAddress(value) {
  let host;
  let portText;

  const bracketedIpv6 = /^\[([^\]]+)]:(\d+)$/.exec(value);
  if (bracketedIpv6) {
    host = bracketedIpv6[1];
    portText = bracketedIpv6[2];
  } else {
    const separator = value.lastIndexOf(':');
    if (separator <= 0) throw new Error('Specify host:port (for example, 192.168.1.10:3000)');
    host = value.slice(0, separator);
    portText = value.slice(separator + 1);
  }

  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid host:port address');
  }
  return { host, port };
}

export async function run(argv) {
  const args = argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    usage();
    return 0;
  }
  if (args.length < 2) {
    usage();
    return 1;
  }

  try {
    const { host, port } = parseAddress(args[0]);
    const command = args[1];
    let remotePath = args[2] || '/';

    // Git Bash can convert a lone slash to its installation directory.
    if (remotePath.includes('Program Files/Git')) remotePath = '/';
    remotePath = remotePath.replace(/\\/g, '/');
    const localDir = process.cwd();

    if (command === 'list' || command === 'ls') {
      await cmdList(host, port, remotePath);
      return 0;
    }
    if (command === 'get') {
      if (!args[2]) throw new Error('Specify a remote file path');
      await cmdGet(host, port, remotePath, localDir);
      return 0;
    }
    if (command === 'get-dir') {
      if (!args[2]) throw new Error('Specify a remote directory path');
      await cmdGetDir(host, port, remotePath, localDir);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return err.code === 'EINTERRUPTED' ? 130 : 1;
  }
}
