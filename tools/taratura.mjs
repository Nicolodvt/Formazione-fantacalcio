/* Confronta le fantamedie STIMATE dal modello con quelle REALMENTE ottenute in campo.

   PERCHE'
   Il modello stima i bonus dal percentile di valore dentro il ruolo: e una scorciatoia
   dichiarata, non una misura. Finche non c'erano dati veri non c'era modo di sapere se la
   scala fosse almeno plausibile. Ora che gli scraper dei voti funzionano, si puo controllare.

   COSA SI PUO E NON SI PUO CONCLUDERE
   Con due sole giornate la varianza e enorme: un attaccante che segna una doppietta fa 10 e
   uno bravissimo che non segna fa 6. Quindi NON si puo giudicare la capacita predittiva sul
   singolo giocatore. Si puo pero controllare due cose che contano davvero:
     - la SCALA: la media delle stime deve somigliare alla media reale, o tutti i confronti
       fra reparti sono spostati;
     - l'ORDINE: se il modello mette in fila i giocatori piu o meno come fa il campo. E cio
       che serve davvero all'app, che deve scegliere CHI schierare, non prevedere il voto.

   Le formule non sono ricopiate: vengono estratte da index.html ed eseguite, cosi si prova
   il codice vero e le due copie non possono divergere.

   NOTA (Fase 3, 04/09): da quando fantamediaAttesa() si mescola da sola con i voti reali
   (dati/voti-N.json), confrontarla con quegli stessi voti sarebbe circolare — l'accordo
   salirebbe per costruzione, non perche' il modello e' bravo. Questo script estrae ed
   esegue fantamediaStimata(), la versione PURA senza alcun dato reale dentro: e' quella,
   non l'altra, che ha senso validare contro il campo.

   USO
     node tools/taratura.mjs
*/

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');

const html = readFileSync(resolve(RADICE, 'index.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const LISTONE = JSON.parse(/<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);

/* Estrae dal sorgente dell'app un pezzo di codice delimitato, per nome. */
function pezzo(nome, tipo = 'function') {
  const re = tipo === 'function'
    ? new RegExp('^function ' + nome + '\\([\\s\\S]*?\\n\\}', 'm')
    : new RegExp('^const ' + nome + ' = [\\s\\S]*?;', 'm');
  const m = re.exec(script);
  if (!m) throw new Error('non trovato nel sorgente: ' + nome);
  return m[0];
}

/* Ricostruisco l'ambiente minimo di cui quelle funzioni hanno bisogno. */
const sorgente = [
  'const MV_MIN = 5.75, MV_MAX = 6.15, MV_AGG_MAX = 0.12;',
  'let MV_SQUADRA = {};',
  'let ATT_SQUADRA = {};',
  pezzo('MV_ZONA', 'const'),
  pezzo('BONUS_MAX', 'const'),
  pezzo('BONUS_CURVA', 'const'),
  pezzo('BONUS_PIAZZATI', 'const'),
  pezzo('MALUS_FISSO', 'const'),
  pezzo('normalizzaSquadre'),
  pezzo('calcolaMvSquadre'),
  pezzo('mvPura'),
  pezzo('golSubitiAttesi'),
  pezzo('fantamediaStimata'),
  'calcolaMvSquadre();',
  'return { fantamediaStimata, mvPura, MV_SQUADRA };'
].join('\n\n');

const motore = new Function('LISTONE', sorgente)(LISTONE);

/* ---------- dati reali ---------- */

const giornate = [1, 2];
const reali = {};          // id -> array di fantavoti effettivi
for (const g of giornate) {
  const V = JSON.parse(readFileSync(resolve(RADICE, 'dati', `voti-${g}.json`), 'utf8'));
  for (const p of Object.values(V.giocatori)) {
    if (p.fantavoto == null) continue;       // senza voto: non e uno zero, e un'assenza
    (reali[p.id] ||= []).push(p.fantavoto);
  }
}

const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));
const campione = Object.entries(reali)
  .map(([id, voti]) => {
    const l = byId[id];
    if (!l) return null;
    const stima = motore.fantamediaStimata(l);
    if (stima == null) return null;
    return {
      nome: l.n, ruolo: l.r, squadra: l.s, presenze: voti.length,
      reale: voti.reduce((s, v) => s + v, 0) / voti.length,
      stima
    };
  })
  .filter(Boolean);

/* ---------- statistiche ---------- */

const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/* Correlazione per ranghi (Spearman): interessa l'ordine, non il valore esatto. */
function spearman(xs, ys) {
  const rango = (v) => {
    const ord = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    let i = 0;
    while (i < ord.length) {
      let j = i;
      while (j + 1 < ord.length && ord[j + 1][0] === ord[i][0]) j++;
      const medio = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[ord[k][1]] = medio;
      i = j + 1;
    }
    return r;
  };
  const rx = rango(xs), ry = rango(ys);
  const mx = media(rx), my = media(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

console.log('TARATURA DEL MODELLO — stime contro fantavoti reali di G' + giornate.join('+G'));
console.log('Campione: ' + campione.length + ' giocatori con almeno un voto.\n');

console.log('per ruolo:');
console.log('  ruolo   n     stima   reale   scarto   ordine (Spearman)');
for (const r of ['P', 'D', 'C', 'A']) {
  const g = campione.filter(x => x.ruolo === r);
  if (g.length < 5) { console.log('  ' + r + '       ' + g.length + '  (troppo pochi)'); continue; }
  const ms = media(g.map(x => x.stima)), mr = media(g.map(x => x.reale));
  const rho = spearman(g.map(x => x.stima), g.map(x => x.reale));
  console.log(
    '  ' + r.padEnd(7) +
    String(g.length).padEnd(6) +
    ms.toFixed(2).padStart(5) + '   ' +
    mr.toFixed(2).padStart(5) + '   ' +
    (ms - mr >= 0 ? '+' : '') + (ms - mr).toFixed(2).padStart(5) + '    ' +
    rho.toFixed(3)
  );
}

const ms = media(campione.map(x => x.stima)), mr = media(campione.map(x => x.reale));
console.log('\ncomplessivo:');
console.log('  media stimata ' + ms.toFixed(2) + ' | media reale ' + mr.toFixed(2) +
  ' | scarto ' + (ms - mr >= 0 ? '+' : '') + (ms - mr).toFixed(2));
console.log('  ordine complessivo (Spearman): ' + spearman(campione.map(x => x.stima), campione.map(x => x.reale)).toFixed(3));

/* Chi il modello sbaglia di piu, per capire DOVE sbaglia invece che solo di quanto. */
const conDue = campione.filter(x => x.presenze === giornate.length);
const peggiori = conDue.map(x => ({ ...x, err: x.stima - x.reale }))
  .sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 12);
console.log('\nscarti maggiori (solo chi ha giocato tutte le giornate):');
peggiori.forEach(x => console.log(
  '  ' + x.nome.padEnd(16) + x.ruolo + '  stima ' + x.stima.toFixed(2) +
  '  reale ' + x.reale.toFixed(2) + '  scarto ' + (x.err >= 0 ? '+' : '') + x.err.toFixed(2)
));
