/* Quanto conta DAVVERO la partita: fattore campo e forza dell'avversario, misurati sul campo.

   PERCHE'
   rettificaPartita() in index.html sposta la fantamedia attesa di +CASA_BONUS in casa e
   -CASA_BONUS in trasferta, e di PESO_AVVERSARIO x (forza dell'avversario nel reparto che
   conta). Entrambe le costanti sono a intuito. Per misurarle servono chi ha giocato contro chi
   e dove: dal 27/09 lo scrive tools/fetch-voti.mjs in dati/calendario.json.

   COME
   Per ogni presenza con voto: residuo = fantavoto vero - fantamediaStimata (la stima PURA,
   senza dati reali dentro, come in taratura.mjs: altrimenti il confronto e' circolare).
   - Fattore campo: media dei residui in casa meno media in trasferta. Il modello dice
     2 x CASA_BONUS (+CASA_BONUS da una parte, -CASA_BONUS dall'altra).
   - Avversario: pendenza (minimi quadrati) del residuo sulla "facilita'" dell'avversario, cioe'
     lo stesso termine che rettificaPartita() moltiplica per PESO_AVVERSARIO (per P/D l'attacco
     avversario, per C/A la sua difesa, dalle quotazioni). Il modello dice PESO_AVVERSARIO.
   Ogni numero esce con il suo margine (circa 95%, due errori standard): con poche giornate
   l'intervallo e' largo, e un numero senza margine farebbe credere di sapere piu' di quanto si
   sa. NON scrive nulla e NON cambia le costanti: dice solo se i dati le contraddicono.

   USO
     node tools/taratura-partita.mjs
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motorePuro, pezzo } from './estrai-motore.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');

const { motore, LISTONE } = motorePuro(RADICE);
const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));
const script = /<script>([\s\S]*?)<\/script>/.exec(readFileSync(resolve(RADICE, 'index.html'), 'utf8'))[1];
const costante = (nome) => Number(/=\s*([\d.]+)/.exec(pezzo(script, nome, 'const'))[1]);
const CASA_BONUS = costante('CASA_BONUS'), PESO_AVVERSARIO = costante('PESO_AVVERSARIO');

const FILE_CAL = resolve(RADICE, 'dati', 'calendario.json');
if (!existsSync(FILE_CAL)) {
  console.log('Manca dati/calendario.json: lo scrive tools/fetch-voti.mjs (o --solo-calendario).');
  process.exit(0);
}
const cal = JSON.parse(readFileSync(FILE_CAL, 'utf8'));

const centro = (motore.MV_MIN + motore.MV_MAX) / 2;
/* Stesso termine di rettificaPartita(), senza PESO_AVVERSARIO: positivo = avversario comodo. */
function facilita(ruolo, avversario) {
  if (ruolo === 'P' || ruolo === 'D') {
    const att = motore.ATT_SQUADRA[avversario];
    return att == null ? null : -(att - centro);
  }
  const dif = motore.MV_SQUADRA[avversario];
  return dif == null ? null : (centro - dif);
}

const oss = [];
const giornate = [];
for (const [g, partite] of Object.entries(cal.giornate || {})) {
  const f = resolve(RADICE, 'dati', `voti-${g}.json`);
  if (!existsSync(f)) continue;
  giornate.push(+g);
  const dove = {};
  for (const p of partite) {
    dove[p.casa] = { casa: true, avversario: p.trasferta };
    dove[p.trasferta] = { casa: false, avversario: p.casa };
  }
  const V = JSON.parse(readFileSync(f, 'utf8'));
  for (const x of Object.values(V.giocatori)) {
    if (x.fantavoto == null) continue;
    const l = byId[x.id];
    const d = dove[x.squadra];
    if (!l || !d) continue;
    const stima = motore.fantamediaStimata(l);
    if (stima == null) continue;
    oss.push({ r: l.r, casa: d.casa, fac: facilita(l.r, d.avversario), res: x.fantavoto - stima });
  }
}

const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const varianza = (a) => { const m = media(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const f2 = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);

function fattoreCampo(sottoinsieme) {
  const c = sottoinsieme.filter(o => o.casa).map(o => o.res), t = sottoinsieme.filter(o => !o.casa).map(o => o.res);
  if (c.length < 10 || t.length < 10) return null;
  const diff = media(c) - media(t);
  const se = Math.sqrt(varianza(c) / c.length + varianza(t) / t.length);
  return { diff, se, n: c.length + t.length };
}
function pendenza(sottoinsieme) {
  const s = sottoinsieme.filter(o => o.fac != null);
  if (s.length < 20) return null;
  const mx = media(s.map(o => o.fac)), my = media(s.map(o => o.res));
  let sxy = 0, sxx = 0;
  for (const o of s) { sxy += (o.fac - mx) * (o.res - my); sxx += (o.fac - mx) ** 2; }
  const b = sxy / sxx;
  const resid = s.map(o => o.res - (my + b * (o.fac - mx)));
  const se = Math.sqrt(resid.reduce((a, v) => a + v * v, 0) / (s.length - 2) / sxx);
  return { b, se, n: s.length, spread: Math.sqrt(sxx / s.length) };
}

console.log(`TARATURA DELLA PARTITA — giornate ${giornate.join(', ')}, ${oss.length} presenze con voto\n`);

console.log(`FATTORE CAMPO (casa meno trasferta, in fantapunti). Il modello usa ${f2(2 * CASA_BONUS)} (2 x CASA_BONUS)`);
for (const [nome, sub] of [['tutti', oss], ...['P', 'D', 'C', 'A'].map(r => [r, oss.filter(o => o.r === r)])]) {
  const x = fattoreCampo(sub);
  if (!x) { console.log(`  ${nome.padEnd(6)} campione troppo piccolo`); continue; }
  const dentro = Math.abs(x.diff - 2 * CASA_BONUS) <= 2 * x.se;
  console.log(`  ${nome.padEnd(6)} ${f2(x.diff)} ± ${(2 * x.se).toFixed(2)}   (n ${x.n})` +
    (nome === 'tutti' ? (dentro ? '   compatibile con il modello' : '   NON compatibile con il modello') : ''));
}

console.log(`\nAVVERSARIO (fantapunti per unita' di "facilita'"). Il modello usa PESO_AVVERSARIO = ${PESO_AVVERSARIO}`);
for (const [nome, sub] of [['tutti', oss], ['P+D', oss.filter(o => o.r === 'P' || o.r === 'D')], ['C+A', oss.filter(o => o.r === 'C' || o.r === 'A')]]) {
  const x = pendenza(sub);
  if (!x) { console.log(`  ${nome.padEnd(6)} campione troppo piccolo`); continue; }
  const dentro = Math.abs(x.b - PESO_AVVERSARIO) <= 2 * x.se;
  console.log(`  ${nome.padEnd(6)} ${f2(x.b)} ± ${(2 * x.se).toFixed(2)}   (n ${x.n}; effetto tipico del modello ` +
    `${(PESO_AVVERSARIO * x.spread).toFixed(2)} fp)` + (nome === 'tutti' ? (dentro ? '   compatibile' : '   NON compatibile') : ''));
}

const campo = fattoreCampo(oss), avv = pendenza(oss);
/* Il margine scende con la radice del campione: a G giornate e' circa margine x sqrt(oggi/G). */
const margineA = (se, g) => (2 * se * Math.sqrt(giornate.length / g)).toFixed(2);
console.log('\nLETTURA');
if (campo) {
  const z = (campo.diff - 2 * CASA_BONUS) / campo.se;
  console.log(`  Fattore campo: misurato ${f2(campo.diff)}, modello ${f2(2 * CASA_BONUS)}, distanza ${Math.abs(z).toFixed(1)} errori standard` +
    ` (oltre 2 = il dato lo contraddice). Margine oggi ${(2 * campo.se).toFixed(2)}, a G19 circa ${margineA(campo.se, 19)},` +
    ` a G38 circa ${margineA(campo.se, 38)}.`);
}
if (avv) {
  const z = (avv.b - PESO_AVVERSARIO) / avv.se;
  console.log(`  Avversario: misurato ${f2(avv.b)}, modello ${PESO_AVVERSARIO}, distanza ${Math.abs(z).toFixed(1)} errori standard.` +
    ` Margine oggi ${(2 * avv.se).toFixed(2)}, a G19 circa ${margineA(avv.se, 19)}, a G38 circa ${margineA(avv.se, 38)}.`);
}
console.log('  Nessuna costante viene cambiata da qui: e\' una diagnosi, non una ricalibrazione.');
