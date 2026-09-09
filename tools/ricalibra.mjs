/* L'app che impara dalla stagione: confronta cio' che il modello puro avrebbe stimato con
   cio' che e' successo davvero (tutte le giornate scaricate finora, non solo le ultime), e se
   uno scarto sistematico per RUOLO e' abbastanza grande e sostenuto da fidarsene, lo corregge
   un po' per volta. Non tocca index.html: scrive dati/costanti.json, che l'app legge a runtime
   (fetchDati(), stesso meccanismo di dati/probabili.json) — cosi' la correzione arriva senza
   bisogno di un deploy, esattamente come i dati di giornata.

   COSA CORREGGE E COSA NO
   Un solo numero per ruolo (RETTIFICA_RUOLO), non una rilettura di ogni costante del modello:
   e' la correzione piu' semplice che si possa fidare con i dati che ci sono oggi. Rifare la
   taratura di BONUS_MAX, CASA_BONUS, PESO_AVVERSARIO eccetera con un vero adattamento
   automatico e' rimandato apposta - servirebbe un calendario storico (chi ha giocato contro
   chi, in casa o trasferta) che oggi non viene ancora archiviato, e con pochi dati un
   adattamento a piu' parametri rincorre il rumore invece del segnale. Vedi CLAUDE.md,
   "L'app impara: RETTIFICA_RUOLO", per il ragionamento completo.

   SICUREZZA CONTRO IL RUMORE (le due giornate di oggi bastano a spiegare perche' servono)
   - Soglia minima di campione per ruolo: sotto MIN_CAMPIONE non si tocca nulla, si tiene
     quello che c'era. Due giornate danno un campione onesto per D/C/A ma risicato per P
     (poche decine di portieri in tutta la Serie A): meglio aspettare che sbagliare presto.
   - Correzione limitata: mai oltre LIMITE in valore assoluto, qualunque cosa dicano i dati -
     un singolo dato anomalo non puo mandare tutto fuori scala.
   - Aggiornamento smorzato, non un salto diretto al nuovo valore misurato: ogni giro si
     sposta solo TASSO_APPRENDIMENTO della distanza dal valore attuale a quello nuovo. Tre o
     quattro giornate anomale in fila non bastano a far ballare la correzione.

   USO
     node tools/ricalibra.mjs
   Gira dentro .github/workflows/dati.yml, subito dopo lo scraper dei voti (solo quando ha
   senso: giornata conclusa). Manuale, va bene lanciarlo anche a mano per controllare cosa
   farebbe senza aspettare il prossimo martedi.
*/

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motorePuro } from './estrai-motore.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');
const FILE_COSTANTI = resolve(RADICE, 'dati', 'costanti.json');

const MIN_CAMPIONE = 30;
const LIMITE = 0.4;
const TASSO_APPRENDIMENTO = 0.3;

const { motore, LISTONE } = motorePuro(RADICE);
const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));

/* ---------- tutti i fantavoti reali disponibili, per ruolo ---------- */

const giornate = readdirSync(resolve(RADICE, 'dati'))
  .map(f => /^voti-(\d+)\.json$/.exec(f))
  .filter(Boolean)
  .map(m => Number(m[1]));

const perRuolo = { P: [], D: [], C: [], A: [] };
for (const g of giornate) {
  const V = JSON.parse(readFileSync(resolve(RADICE, 'dati', `voti-${g}.json`), 'utf8'));
  for (const p of Object.values(V.giocatori)) {
    if (p.fantavoto == null) continue;
    const l = byId[p.id];
    if (!l || !perRuolo[l.r]) continue;
    const stima = motore.fantamediaStimata(l);
    if (stima == null) continue;
    perRuolo[l.r].push({ stima, reale: p.fantavoto });
  }
}

/* ---------- correzione attuale, per partire da li' e non da zero ---------- */

let precedente = { P: 0, D: 0, C: 0, A: 0 };
if (existsSync(FILE_COSTANTI)) {
  try {
    const d = JSON.parse(readFileSync(FILE_COSTANTI, 'utf8'));
    if (d && d.rettificaRuolo) precedente = Object.assign(precedente, d.rettificaRuolo);
  } catch (e) { /* file corrotto o assente: si riparte da zero, non e' un errore fatale */ }
}

/* ---------- calcolo, ruolo per ruolo ---------- */

const nuova = {};
const dettaglio = {};
for (const r of ['P', 'D', 'C', 'A']) {
  const campione = perRuolo[r];
  const n = campione.length;
  if (n < MIN_CAMPIONE) {
    nuova[r] = precedente[r];
    dettaglio[r] = { n, campioneSufficiente: false, correzione: precedente[r] };
    continue;
  }
  const scartoGrezzo = campione.reduce((s, x) => s + (x.reale - x.stima), 0) / n;
  const obiettivo = Math.max(-LIMITE, Math.min(LIMITE, scartoGrezzo));
  const smorzato = precedente[r] + TASSO_APPRENDIMENTO * (obiettivo - precedente[r]);
  nuova[r] = Math.round(smorzato * 1000) / 1000;
  dettaglio[r] = { n, campioneSufficiente: true, scartoGrezzo, obiettivo, correzione: nuova[r] };
}

/* ---------- scrittura ---------- */

const out = {
  schema: 1,
  generato: new Date().toISOString(),
  giornateUsate: giornate,
  rettificaRuolo: nuova
};
writeFileSync(FILE_COSTANTI, JSON.stringify(out, null, 1) + '\n');

console.log('RICALIBRAZIONE — correzione per ruolo (fantamedia attesa)\n');
console.log('  ruolo   n     scarto grezzo   correzione precedente -> nuova');
for (const r of ['P', 'D', 'C', 'A']) {
  const d = dettaglio[r];
  if (!d.campioneSufficiente) {
    console.log(`  ${r}       ${String(d.n).padEnd(5)} (sotto i ${MIN_CAMPIONE}, invariata)   ${precedente[r].toFixed(3)}`);
  } else {
    console.log(
      `  ${r}       ${String(d.n).padEnd(5)} ${(d.scartoGrezzo >= 0 ? '+' : '') + d.scartoGrezzo.toFixed(3)}          ` +
      `${precedente[r].toFixed(3)} -> ${d.correzione.toFixed(3)}`
    );
  }
}
console.log('\nScritto in dati/costanti.json.');
