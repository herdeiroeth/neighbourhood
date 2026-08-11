import http from 'node:http';
import os from 'node:os';
import { ENDPOINTS, DEFAULT_PORT } from '../shared/protocol.js';
import { handleList, handleStat, handleDownload, handleDownloadDir } from './routes.js';

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function gracefulShutdown(server, signal) {
  console.log(`\n  Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('  Server closed.');
    process.exit(0);
  });

  // Force close if lingering connections prevent clean shutdown
  setTimeout(() => {
    console.error('  Forcing shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

export function startServer(rootDir, port = DEFAULT_PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const relativePath = url.searchParams.get('path') || '/';

    // CORS for potential browser access
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      if (pathname === ENDPOINTS.LIST) {
        await handleList(req, res, rootDir, relativePath);
      } else if (pathname === ENDPOINTS.STAT) {
        await handleStat(req, res, rootDir, relativePath);
      } else if (pathname === ENDPOINTS.DOWNLOAD) {
        await handleDownload(req, res, rootDir, relativePath);
      } else if (pathname === ENDPOINTS.DOWNLOAD_DIR) {
        await handleDownloadDir(req, res, rootDir, relativePath);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Use /api/list, /api/stat, /api/download, /api/download-dir');
      }
    } catch (err) {
      console.error(`Error handling ${pathname}: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
      }
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const ip = getLanIp();
    console.log(`\n  trans-server running`);
    console.log(`  Root: ${rootDir}`);
    console.log(`  Local: http://localhost:${port}`);
    console.log(`  LAN:   http://${ip}:${port}`);
    console.log(`\n  On the other machine run:`);
    console.log(`    node bin/client.js ${ip}:${port} list /\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));

  return server;
}
