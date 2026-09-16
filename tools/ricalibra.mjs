/* L'app che impara dalla stagione: confronta cio' che il modello puro avrebbe stimato con
   cio' che e' successo davvero (tutte le giornate scaricate finora, non solo le ultime), e se
   uno scarto sistematico e' abbastanza grande e sostenuto da fidarsene, lo corregge un po' per
   volta. Non tocca index.html: scrive dati/costanti.json, che l'app legge a runtime
   (fetchDati(), stesso meccanismo di dati/probabili.json) — cosi' la correzione arriva senza
   bisogno di un deploy, esattamente come i dati di giornata.

   COSA CORREGGE E COSA NO
   Due correzioni, stesso schema (soglia di campione, limite, aggiornamento smorzato) ma su due
   cose diverse:
   - RETTIFICA_RUOLO: un solo numero per ruolo, sullo scarto totale fantamedia stimata/reale.
   - RETTIFICA_PIAZZATI (15/09): un numero per tag rigori (R1/R2/R3), sul bonus REALE osservato
     di chi ha quel tag sul listone — rigoriSegnati*3 - rigoriSbagliati*3, i pesi veri di
     tools/fetch-voti.mjs, non ricopiati a mano. E' la parte di "usare il dettaglio gol/assist/
     rigori/cartellini gia' salvato" chiesta dall'utente il 05/09 (vedi DIARIO-STORICO.md):
     l'unico pezzo di quel dettaglio con un segnale pulito e isolabile. Punizioni (P1/P2/P3) NON
     si calibrano: un gol su punizione non e' un campo distinto nei dati (finisce dentro "gol"
     insieme a tutti gli altri), quindi restano a intuito.
   Rifare la taratura di BONUS_MAX, CASA_BONUS, PESO_AVVERSARIO con un vero adattamento
   automatico resta rimandato - servirebbe un calendario storico (chi ha giocato contro chi, in
   casa o trasferta) che oggi non viene ancora archiviato, e con pochi dati un adattamento a piu'
   parametri rincorre il rumore invece del segnale. Vedi CLAUDE.md, "Come funziona il motore".

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

/* ---------- piazzati (rigori): bonus reale osservato per chi ha il tag sul listone ----------
   Stessi pesi di tools/fetch-voti.mjs (non importabile qui: fa partire lo scraper vero al solo
   caricamento del modulo, essendo pensato per girare da riga di comando) — se mai cambiassero
   vanno aggiornati in entrambi i posti, stesso compromesso gia' accettato per parseDataPartita/
   tools/calendario.mjs. Punizioni (P1/P2/P3) escluse apposta: un gol su punizione finisce dentro
   il campo generico "gol", non c'e' modo di isolarlo dai dati scaricati. */
const PESO_RIGORE_SEGNATO = 3, PESO_RIGORE_SBAGLIATO = -3;
const TAG_RIGORI = ['R1', 'R2', 'R3'];

const perTagRigori = Object.fromEntries(TAG_RIGORI.map(t => [t, []]));
for (const g of giornate) {
  const V = JSON.parse(readFileSync(resolve(RADICE, 'dati', `voti-${g}.json`), 'utf8'));
  for (const p of Object.values(V.giocatori)) {
    if (p.fantavoto == null) continue;      // niente voto: niente osservazione utile
    const l = byId[p.id];
    if (!l || !l.pz) continue;
    const b = p.bonus || {};
    const bonusRigoriReale = (b.rigoriSegnati || 0) * PESO_RIGORE_SEGNATO +
      (b.rigoriSbagliati || 0) * PESO_RIGORE_SBAGLIATO;
    for (const tag of TAG_RIGORI) {
      if (l.pz.indexOf(tag) !== -1) perTagRigori[tag].push(bonusRigoriReale);
    }
  }
}

let precedentePiazzati = {};
if (existsSync(FILE_COSTANTI)) {
  try {
    const d = JSON.parse(readFileSync(FILE_COSTANTI, 'utf8'));
    if (d && d.rettificaPiazzati) precedentePiazzati = d.rettificaPiazzati;
  } catch (e) { /* file corrotto o assente: si riparte da zero */ }
}

const nuovaPiazzati = {};
const dettaglioPiazzati = {};
for (const tag of TAG_RIGORI) {
  const campione = perTagRigori[tag];
  const n = campione.length;
  const prec = precedentePiazzati[tag] || 0;
  if (n < MIN_CAMPIONE) {
    // Popolazione di un tag e' piccola per natura (pochi rigoristi in tutta la Serie A): sotto
    // soglia e' la norma per buona parte della stagione, non un guasto. Si tiene la correzione
    // precedente se ce n'era gia' una, altrimenti si lascia il tag assente (zero implicito).
    if (prec) nuovaPiazzati[tag] = prec;
    dettaglioPiazzati[tag] = { n, campioneSufficiente: false, correzione: prec };
    continue;
  }
  const mediaOsservata = campione.reduce((s, v) => s + v, 0) / n;
  const scartoGrezzo = mediaOsservata - ((motore.BONUS_PIAZZATI[tag] || 0) + prec);
  const obiettivo = Math.max(-LIMITE, Math.min(LIMITE, scartoGrezzo));
  const smorzato = prec + TASSO_APPRENDIMENTO * (obiettivo - prec);
  nuovaPiazzati[tag] = Math.round(smorzato * 1000) / 1000;
  dettaglioPiazzati[tag] = { n, campioneSufficiente: true, mediaOsservata, obiettivo, correzione: nuovaPiazzati[tag] };
}

/* ---------- scrittura ---------- */

const out = {
  schema: 1,
  generato: new Date().toISOString(),
  giornateUsate: giornate,
  rettificaRuolo: nuova,
  rettificaPiazzati: nuovaPiazzati
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

console.log('\nRICALIBRAZIONE — correzione sui piazzati (bonus rigori)\n');
console.log('  tag   n     bonus osservato   base+precedente   correzione precedente -> nuova');
for (const tag of TAG_RIGORI) {
  const d = dettaglioPiazzati[tag];
  if (!d.campioneSufficiente) {
    console.log(`  ${tag}    ${String(d.n).padEnd(5)} (sotto i ${MIN_CAMPIONE}, invariata)              ${d.correzione.toFixed(3)}`);
  } else {
    console.log(
      `  ${tag}    ${String(d.n).padEnd(5)} ${d.mediaOsservata.toFixed(3).padStart(6)}            ${(motore.BONUS_PIAZZATI[tag] + (precedentePiazzati[tag]||0)).toFixed(3)}             ` +
      `${(precedentePiazzati[tag]||0).toFixed(3)} -> ${d.correzione.toFixed(3)}`
    );
  }
}

console.log('\nScritto in dati/costanti.json.');
