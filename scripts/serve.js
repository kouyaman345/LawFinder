#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const STATIC_PATH = path.join(__dirname, '..', 'dist', 'static');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(STATIC_PATH, req.url === '/' ? 'index.html' : req.url);
  
  // セキュリティ: パストラバーサル攻撃を防ぐ
  if (!filePath.startsWith(STATIC_PATH)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    } else {
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║          LawFinder 開発サーバー            ║
╚════════════════════════════════════════════╝

  サーバーが起動しました！
  
  URL: http://localhost:${PORT}
  
  静的ファイルのパス: ${STATIC_PATH}
  
  Ctrl+C で終了
  `);
});