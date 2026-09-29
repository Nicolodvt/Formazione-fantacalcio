/* Server statico minimo per provare l'app in locale.
   Serve solo allo sviluppo: in produzione ci pensa Netlify.

   USO
     node tools/serve.mjs                          porta 8099
     node tools/serve.mjs --porta 8097 --lento 8000
       --lento MS: ogni risposta parte dopo MS millisecondi, per provare l'apertura dell'app con
       una rete che non fallisce ma non risponde (il ripiego del service worker, 29/09). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const TIPI = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

const arg = (nome, base) => { const i = process.argv.indexOf(nome); return i > 0 ? Number(process.argv[i + 1]) : base; };
const PORTA = arg('--porta', 8099);
const LENTO = arg('--lento', 0);

createServer(async (req, res) => {
  if (LENTO) await new Promise(r => setTimeout(r, LENTO));
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
}).listen(PORTA, () => console.log('http://localhost:' + PORTA + (LENTO ? ' (lento: ' + LENTO + ' ms)' : '')));
