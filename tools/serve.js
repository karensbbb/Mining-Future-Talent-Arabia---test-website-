#!/usr/bin/env node
/**
 * tools/serve.js — static dev server for the mining site.
 *
 * Usage
 *   node tools/serve.js [--port 4321] [--root .]
 *
 * Serves the project directory with no caching, so a reload always shows the
 * current file. Extensionless paths resolve to `<name>.html`, which means the
 * local URLs match how the pages will be addressed once deployed.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const opts = { port: 4321, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') opts.port = Number(argv[++i]);
    else if (argv[i] === '--root') opts.root = path.resolve(argv[++i]);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(opts.root);

/** Resolve a request path to a file, trying `.html` for extensionless URLs. */
function resolveFile(pathname) {
  let rel = decodeURIComponent(pathname.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';

  const abs = path.join(ROOT, rel);
  // Reject anything that climbs out of the served root.
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;

  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  if (!path.extname(abs) && fs.existsSync(abs + '.html')) return abs + '.html';
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url);

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — ' + req.url);
    console.log('404 ' + req.url);
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 — ' + err.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${opts.port} is already in use. Pass --port <n> to pick another.`);
    process.exit(1);
  }
  throw err;
});

server.listen(opts.port, () => {
  console.log(`Mining site serving ${ROOT}`);
  console.log(`  http://localhost:${opts.port}/`);
});
