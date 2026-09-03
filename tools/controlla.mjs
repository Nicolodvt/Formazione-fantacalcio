/* Controllo di integrita' dell'app.

   PERCHE' ESISTE
   Sull'app asta una sostituzione "da qui a li" ha cancellato in silenzio interi blocchi di
   codice — ricerca, ordinamento, tutto il foglio impostazioni — e il controllo di sintassi
   passava lo stesso, perche' il codice restava valido: mancava e basta. Lo stesso vale per il
   CSS, dove una regola persa non da' errore: l'elemento resta li', semplicemente senza stile.

   Questo script confronta lo stato attuale con una versione precedente (di default l'ultimo
   commit) e dice cosa e' SPARITO. Le aggiunte non interessano: si notano da sole.

   USO
     node tools/controlla.mjs              confronta con l'ultimo commit (HEAD)
     node tools/controlla.mjs HEAD~3       confronta con un altro commit
     node tools/controlla.mjs --solo       solo i controlli interni, senza confronto
*/

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');
const FILE = 'index.html';

/* ---------- estrattori ---------- */

const script = (h) => {
  const m = /<script>([\s\S]*?)<\/script>/.exec(h);
  return m ? m[1] : '';
};
const stile = (h) => {
  const m = /<style>([\s\S]*?)<\/style>/.exec(h);
  return m ? m[1] : '';
};

const insieme = (arr) => [...new Set(arr)].sort();

const funzioni = (js) => insieme([
  ...[...js.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]),
  ...[...js.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/gm)].map(m => m[1])
]);

/* Non basta contare i listener: serve sapere SU COSA sono registrati, altrimenti sparisce
   un bottone e il totale resta uguale perche' nel frattempo se n'e' aggiunto un altro. */
const listener = (js) => insieme(
  [...js.matchAll(/([A-Za-z0-9_$.'"#\[\]()-]+)\s*\.addEventListener\(\s*'([a-z]+)'/g)]
    .map(m => m[1].replace(/\s+/g, '') + ' → ' + m[2])
);

const idUsati = (js) => insieme([...js.matchAll(/(?:el|document\.getElementById)\(\s*'#?([A-Za-z0-9_-]+)'/g)].map(m => m[1]));

/* Tutti gli id che esistono: quelli nell'HTML statico e quelli costruiti nelle stringhe
   template della UI, che sono altrettanto reali. */
const idDefiniti = (h) => insieme([...h.matchAll(/id=\\?"([A-Za-z0-9_-]+)\\?"/g)].map(m => m[1]));

const selettori = (css) => insieme(
  css.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map(b => b.split('{')[0])
    .filter(s => s && !s.trim().startsWith('@') && !/^\s*(from|to|\d+%)\s*$/.test(s))
    .flatMap(s => s.split(','))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
);

function analizza(html) {
  const js = script(html), css = stile(html);
  return {
    js, css,
    funzioni: funzioni(js),
    listener: listener(js),
    idUsati: idUsati(js),
    idDefiniti: idDefiniti(html),
    selettori: selettori(css)
  };
}

/* ---------- controlli ---------- */

const perse = (vecchio, nuovo) => vecchio.filter(x => nuovo.indexOf(x) === -1);

let problemi = 0;
const ko = (t, righe) => { problemi++; console.log('\n  ✗ ' + t); righe.forEach(r => console.log('      ' + r)); };
const ok = (t) => console.log('  ✓ ' + t);

const htmlOra = readFileSync(join(RADICE, FILE), 'utf8');
const ora = analizza(htmlOra);

console.log('CONTROLLO INTEGRITA — ' + FILE + '\n');

/* 1. sintassi */
const tmp = join(mkdtempSync(join(tmpdir(), 'ctrl-')), 'app.js');
writeFileSync(tmp, ora.js);
try {
  execSync('node --check "' + tmp + '"', { stdio: 'pipe' });
  ok('sintassi JavaScript valida');
} catch (e) {
  ko('sintassi JavaScript', [String(e.stderr || e.message).split('\n').slice(0, 5).join('\n      ')]);
}

/* 2. il listone incorporato e' ancora JSON leggibile */
try {
  const m = /<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(htmlOra);
  const L = JSON.parse(m[1]);
  if (L.length < 400) throw new Error('solo ' + L.length + ' giocatori');
  ok('listone incorporato: ' + L.length + ' giocatori');
} catch (e) {
  ko('listone incorporato', [e.message]);
}

/* 3. ogni el('#id') punta a qualcosa che esiste */
const orfani = ora.idUsati.filter(i => ora.idDefiniti.indexOf(i) === -1);
if (orfani.length) ko('id cercati ma mai definiti', orfani);
else ok(ora.idUsati.length + ' id referenziati, tutti presenti');

/* 4. ogni classe usata nel markup ha una regola CSS (solo segnalazione, non e' un errore) */
ok(ora.funzioni.length + ' funzioni, ' + ora.listener.length + ' listener, ' + ora.selettori.length + ' selettori CSS');

/* 5. confronto con la versione precedente */
const arg = process.argv[2];
if (arg !== '--solo') {
  const ref = arg || 'HEAD';
  let htmlPrima = null;
  try {
    htmlPrima = execSync('git show ' + ref + ':' + FILE, { cwd: RADICE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    console.log('\n  · nessuna versione ' + ref + ' con cui confrontare (prima volta?)');
  }
  if (htmlPrima) {
    console.log('\nCONFRONTO CON ' + ref + '\n');
    const prima = analizza(htmlPrima);
    const coppie = [
      ['funzioni sparite', prima.funzioni, ora.funzioni],
      ['listener spariti', prima.listener, ora.listener],
      ['selettori CSS spariti', prima.selettori, ora.selettori],
      ['id spariti dall HTML', prima.idDefiniti, ora.idDefiniti]
    ];
    for (const [titolo, v, n] of coppie) {
      const p = perse(v, n);
      if (p.length) ko(titolo + ' (' + p.length + ')', p);
      else ok('nessuna perdita: ' + titolo.replace(' spariti', '').replace(' sparite', '').replace(' sparite', ''));
    }
  }
}

console.log('\n' + (problemi ? problemi + ' PROBLEMA/I DA GUARDARE' : 'Tutto a posto.') + '\n');
process.exit(problemi ? 1 : 0);
