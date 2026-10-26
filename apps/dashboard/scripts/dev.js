'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createHandler, CSP } = require('../lib/backend');
const handler = createHandler();
const root = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handler(request, response);
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { response.writeHead(400); response.end(); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(404); response.end(); return; }
  try {
    const content = await fs.promises.readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ code: 'DASHBOARD_LOCAL_PREVIEW', url: `http://127.0.0.1:${server.address().port}` })));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
