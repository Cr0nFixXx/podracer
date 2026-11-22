// Tiny local receiver for harness screenshots (browser → files in tools/harness/out, which git ignores for *.jpg / *.png).
// Usage: node tools/harness/shot-server.mjs   (listens on 127.0.0.1:5174 only)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
// Only the local dev server may store pictures (a page of any other site could otherwise write files here while this runs).
// More origins: SHOT_ORIGINS="http://localhost:5180,http://127.0.0.1:5180". A request without an Origin header (curl, node) passes.
const ALLOWED = new Set((process.env.SHOT_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(o => o.trim()).filter(Boolean));
http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED.has(origin)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('origin not allowed'); return; }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const u = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'POST' && u.pathname === '/save') {
    const raw = (u.searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '_');
    const name = /\.(jpg|png)$/.test(raw) ? raw : raw + '.jpg';
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { const f = path.join(OUT, name); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks)); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(f); });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('podracer shot server');
}).listen(5174, '127.0.0.1', () => console.log('shot server on http://127.0.0.1:5174 ->', OUT));
