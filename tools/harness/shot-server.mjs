// Tiny local receiver for harness screenshots (browser → files in tools/harness/out, which git ignores for *.jpg / *.png).
// Usage: node tools/harness/shot-server.mjs   (listens on 127.0.0.1:5174 only)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const u = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'POST' && u.pathname === '/save') {
    const raw = (u.searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '_');
    const name = /\.(jpg|png)$/.test(raw) ? raw : raw + '.jpg';
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.concat(chunks)); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(f); });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('podracer shot server');
}).listen(5174, '127.0.0.1', () => console.log('shot server on http://127.0.0.1:5174 ->', OUT));
