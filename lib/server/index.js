import http from 'node:http';
import os from 'node:os';
import { realpathSync, statSync } from 'node:fs';
import { ENDPOINTS, DEFAULT_PORT } from '../shared/protocol.js';
import { handleList, handleStat, handleDownload, handleDownloadDir } from './routes.js';

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function validatePort(port) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError('Port must be an integer between 0 and 65535');
  }
  return port;
}

function gracefulShutdown(server, signal, logger) {
  logger.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => logger.log('Server closed.'));

  setTimeout(() => {
    logger.error('Forcing shutdown after timeout.');
    server.closeAllConnections();
  }, 5000).unref();
}

export function startServer(rootDir, port = DEFAULT_PORT, options = {}) {
  const {
    host = '0.0.0.0',
    logger = console,
    manageSignals = true,
  } = options;

  const canonicalRoot = realpathSync(rootDir);
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new TypeError(`Shared root is not a directory: ${rootDir}`);
  }
  validatePort(port);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const requestedPath = url.searchParams.get('path') || '/';
      const supportsHead = pathname === ENDPOINTS.DOWNLOAD || pathname === ENDPOINTS.DOWNLOAD_DIR;

      if (req.method !== 'GET' && !(req.method === 'HEAD' && supportsHead)) {
        res.writeHead(405, {
          Allow: supportsHead ? 'GET, HEAD' : 'GET',
          'Content-Type': 'application/json; charset=utf-8',
        });
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }

      if (pathname === ENDPOINTS.LIST) {
        return await handleList(req, res, canonicalRoot, requestedPath);
      }
      if (pathname === ENDPOINTS.STAT) {
        return await handleStat(req, res, canonicalRoot, requestedPath);
      }
      if (pathname === ENDPOINTS.DOWNLOAD) {
        return await handleDownload(req, res, canonicalRoot, requestedPath);
      }
      if (pathname === ENDPOINTS.DOWNLOAD_DIR) {
        return await handleDownloadDir(req, res, canonicalRoot, requestedPath);
      }

      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      logger.error(`Request error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return res.destroy(err);
    }
  });

  server.listen(port, host, () => {
    if (!logger) return;
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    const lanIp = getLanIp();

    logger.log('\nneighbourhood server running');
    logger.log(`Root:  ${canonicalRoot}`);
    logger.log(`Local: http://localhost:${activePort}`);
    if (host === '0.0.0.0' || host === '::') {
      logger.log(`LAN:   http://${lanIp}:${activePort}`);
      logger.log('\nOn the other machine run:');
      logger.log(`  neighbourhood-client ${lanIp}:${activePort} list /\n`);
    }
  });

  if (manageSignals) {
    const onSigint = () => gracefulShutdown(server, 'SIGINT', logger || console);
    const onSigterm = () => gracefulShutdown(server, 'SIGTERM', logger || console);
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    server.once('close', () => {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    });
  }

  return server;
}
