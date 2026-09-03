/* Server statico minimo per provare l'app in locale.
   Serve solo allo sviluppo: in produzione ci pensa Netlify. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const TIPI = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  /* Si lavora sul path dell URL, che usa sempre /, e si scartano i .. : cosi nessuno
     puo chiedere file fuori dalla cartella del progetto. */
  const parti = p.split(String.fromCharCode(47)).filter(x => x && x !== '..' && x !== '.');
  const file = join(ROOT, ...parti);
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPI[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
}).listen(8099, () => console.log('http://localhost:8099'));
