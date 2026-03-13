import { cmdList, cmdGet, cmdGetDir } from './commands.js';

function usage() {
  console.log(`
  trans-client - LAN file transfer client

  Usage:
    node bin/client.js <host:port> list [path]            Browse remote files
    node bin/client.js <host:port> get <remote-path>      Download a file
    node bin/client.js <host:port> get-dir <remote-path>  Download a directory

  Examples:
    node bin/client.js 192.168.1.10:3000 list /
    node bin/client.js 192.168.1.10:3000 list /Documents
    node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip
    node bin/client.js 192.168.1.10:3000 get-dir /Documents
  `);
}

export async function run(argv) {
  const args = argv.slice(2);

  if (args.length < 2) {
    usage();
    process.exit(1);
  }

  const hostPort = args[0];
  const command = args[1];
  let remotePath = args[2] || '/';
  // Fix MINGW/Git Bash path conversion (converts / to C:/Program Files/Git/)
  if (remotePath.includes('Program Files/Git')) remotePath = '/';
  // Normalize to forward slashes
  remotePath = remotePath.replace(/\\/g, '/');

  // Parse host:port
  const colonIdx = hostPort.lastIndexOf(':');
  if (colonIdx === -1) {
    console.error('Error: specify host:port (e.g., 192.168.1.10:3000)');
    process.exit(1);
  }
  const host = hostPort.slice(0, colonIdx);
  const port = parseInt(hostPort.slice(colonIdx + 1), 10);

  if (!host || isNaN(port)) {
    console.error('Error: invalid host:port format');
    process.exit(1);
  }

  const localDir = process.cwd();

  try {
    switch (command) {
      case 'list':
      case 'ls':
        await cmdList(host, port, remotePath);
        break;
      case 'get':
        if (!args[2]) {
          console.error('Error: specify remote path. E.g.: get /file.txt');
          process.exit(1);
        }
        await cmdGet(host, port, remotePath, localDir);
        break;
      case 'get-dir':
        if (!args[2]) {
          console.error('Error: specify remote path. E.g.: get-dir /Documents');
          process.exit(1);
        }
        await cmdGetDir(host, port, remotePath, localDir);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
    process.exit(1);
  }
}
