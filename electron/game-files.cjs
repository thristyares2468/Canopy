const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PUBLIC_ROOT_FILES = new Set([
  'index.html',
  'legal.html',
  'core.js',
  'sw.js',
  'jim-favicon.png',
  'jims-mowing-logo.png',
  'dust2-minimap.png'
]);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp'
};

const SAME_ORIGIN_SOCKET = /new WebSocket\(\s*`\$\{protocol\}\/\/\$\{location\.host\}`\s*\)/;

function onlineWebSocketUrl(serverUrl) {
  const parsed = new URL(serverUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('The online game server must use HTTP or HTTPS.');
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString();
}

function routeGameClientOnline(html, serverUrl) {
  const socketUrl = onlineWebSocketUrl(serverUrl);
  if (!SAME_ORIGIN_SOCKET.test(html)) {
    throw new Error('The game client connection point changed, so Canopy could not safely route it to the online server.');
  }
  return html.replace(SAME_ORIGIN_SOCKET, `new WebSocket(${JSON.stringify(socketUrl)})`);
}

function resolvePublicGameFile(sourcePath, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/legal' || pathname === '/legal/') pathname = '/legal.html';
  const relativePath = pathname.replace(/^\/+/, '');
  const publicPath = relativePath.startsWith('assets/') || PUBLIC_ROOT_FILES.has(relativePath);
  if (!publicPath) return null;
  const root = path.resolve(sourcePath);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = error => { cleanup(); reject(error); };
    const onListening = () => { cleanup(); resolve(); };
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function startGameFilesServer({ sourcePath, onlineServerUrl, preferredPort = 3000 }) {
  const indexPath = path.join(sourcePath, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`No game client was found at ${indexPath}`);
  onlineWebSocketUrl(onlineServerUrl);

  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const filePath = resolvePublicGameFile(sourcePath, request.url || '/');
    if (!filePath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, file) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error.code === 'ENOENT' ? 'Not found' : 'Could not read game file');
        return;
      }
      let body = file;
      try {
        if (path.basename(filePath) === 'index.html') body = Buffer.from(routeGameClientOnline(file.toString('utf8'), onlineServerUrl));
      } catch (rewriteError) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(rewriteError.message);
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': path.extname(filePath) === '.html' || path.extname(filePath) === '.js' ? 'no-store' : 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    });
  });

  const requestedPort = Math.max(0, Math.min(65535, Number(preferredPort) || 0));
  try {
    await listen(server, requestedPort);
  } catch (error) {
    if (error.code !== 'EADDRINUSE' || requestedPort === 0) throw error;
    await listen(server, 0);
  }
  const address = server.address();
  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

module.exports = {
  PUBLIC_ROOT_FILES,
  onlineWebSocketUrl,
  resolvePublicGameFile,
  routeGameClientOnline,
  startGameFilesServer
};
