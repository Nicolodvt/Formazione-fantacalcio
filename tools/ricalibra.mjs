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
   - Per i piazzati, anche un minimo di rigori TIRATI per tag (MIN_RIGORI): le presenze non
     bastano, la media si muove solo quando qualcuno calcia (27/09).
   - Aggiornamento smorzato, non un salto diretto al nuovo valore misurato: ogni giro si
     sposta solo TASSO_APPRENDIMENTO della distanza dal valore attuale a quello nuovo. Tre o
     quattro giornate anomale in fila non bastano a far ballare la correzione.

   USO
     node tools/ricalibra.mjs
   Gira dentro .github/workflows/dati.yml, subito dopo lo scraper dei voti (solo quando ha
   senso: giornata conclusa). Fa un passo solo se in dati/ c'e' una giornata di voti che
   l'ultimo giro non aveva: altrimenti esce senza scrivere nulla, quindi rilanciarlo (in CI o
   a mano) e' innocuo. Per vedere come va il modello senza toccare nulla c'e' tools/taratura.mjs.
*/

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motorePuro } from './estrai-motore.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');
const FILE_COSTANTI = resolve(RADICE, 'dati', 'costanti.json');

const MIN_CAMPIONE = 30;
/* Per i piazzati le presenze non dicono quanto e' solido il dato: un R1 con 80 presenze ha
   tirato forse 2 rigori, e sono quei tiri (non le presenze) a muovere la media. Sotto questa
   soglia di rigori tirati per tag non si corregge nulla (27/09, vedi il blocco dei piazzati). */
const MIN_RIGORI = 10;
const LIMITE = 0.4;
const TASSO_APPRENDIMENTO = 0.3;

const { motore, LISTONE } = motorePuro(RADICE);
const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));

/* ---------- tutti i fantavoti reali disponibili, per ruolo ---------- */

const giornate = readdirSync(resolve(RADICE, 'dati'))
  .map(f => /^voti-(\d+)\.json$/.exec(f))
  .filter(Boolean)
  .map(m => Number(m[1]))
  .sort((a, b) => a - b);

/* ---------- un passo per ogni giornata nuova, non uno per ogni lancio ----------
   L'aggiornamento e' smorzato e parte dal valore precedente: rilanciato sugli stessi voti fa un
   passo in piu' ogni volta, come se fosse arrivata un'altra giornata. Succedeva a mano (notte
   15-16/09) ma anche in CI, e ogni settimana: dati.yml lo lancia a TUTTI i giri di lunedi e
   martedi (fino a 4), anche quando i voti nuovi sono gia' arrivati al primo. Sui voti G1-G5 la
   correzione degli attaccanti e' andata 0.236 -> 0.261 -> 0.278 -> 0.290 -> 0.299 in due giorni,
   quattro passi invece di uno (scoperto il 26/09). Ora, se le giornate sono le stesse
   dell'ultimo giro scritto in dati/costanti.json, non si tocca nulla: lanciarlo quante volte si
   vuole e' innocuo. */
let costantiPrecedenti = null;
if (existsSync(FILE_COSTANTI)) {
  try { costantiPrecedenti = JSON.parse(readFileSync(FILE_COSTANTI, 'utf8')); }
  catch (e) { /* file corrotto: si riparte da zero, non e' un errore fatale */ }
}
const giaUsate = costantiPrecedenti && Array.isArray(costantiPrecedenti.giornateUsate)
  ? [...costantiPrecedenti.giornateUsate].sort((a, b) => a - b) : null;
if (giaUsate && giaUsate.join(',') === giornate.join(',')) {
  console.log(`Nessuna giornata nuova (voti ${giornate.join(', ')} gia' usati): ricalibrazione non necessaria, ` +
    'dati/costanti.json non toccato.');
  process.exit(0);
}

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
if (costantiPrecedenti && costantiPrecedenti.rettificaRuolo) {
  precedente = Object.assign(precedente, costantiPrecedenti.rettificaRuolo);
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
const tiriPerTag = Object.fromEntries(TAG_RIGORI.map(t => [t, 0]));
for (const g of giornate) {
  const V = JSON.parse(readFileSync(resolve(RADICE, 'dati', `voti-${g}.json`), 'utf8'));
  for (const p of Object.values(V.giocatori)) {
    if (p.fantavoto == null) continue;      // niente voto: niente osservazione utile
    const l = byId[p.id];
    if (!l || !l.pz) continue;
    const b = p.bonus || {};
    const bonusRigoriReale = (b.rigoriSegnati || 0) * PESO_RIGORE_SEGNATO +
      (b.rigoriSbagliati || 0) * PESO_RIGORE_SBAGLIATO;
    const tiri = (b.rigoriSegnati || 0) + (b.rigoriSbagliati || 0);
    for (const tag of TAG_RIGORI) {
      if (l.pz.indexOf(tag) !== -1) { perTagRigori[tag].push(bonusRigoriReale); tiriPerTag[tag] += tiri; }
    }
  }
}

const precedentePiazzati = (costantiPrecedenti && costantiPrecedenti.rettificaPiazzati) || {};

const nuovaPiazzati = {};
const dettaglioPiazzati = {};
for (const tag of TAG_RIGORI) {
  const campione = perTagRigori[tag];
  const n = campione.length;
  const prec = precedentePiazzati[tag] || 0;
  const tiri = tiriPerTag[tag];
  if (n < MIN_CAMPIONE || tiri < MIN_RIGORI) {
    // Popolazione di un tag e' piccola per natura (pochi rigoristi in tutta la Serie A): sotto
    // soglia e' la norma per buona parte della stagione, non un guasto. Si tiene la correzione
    // precedente se ce n'era gia' una, altrimenti si lascia il tag assente (zero implicito).
    if (prec) nuovaPiazzati[tag] = prec;
    dettaglioPiazzati[tag] = { n, tiri, campioneSufficiente: false, correzione: prec };
    continue;
  }
  const mediaOsservata = campione.reduce((s, v) => s + v, 0) / n;
  /* Scarto misurato contro la sola base BONUS_PIAZZATI, come RETTIFICA_RUOLO si misura contro
     la stima pura (27/09). Fino al 26/09 si misurava contro base+correzione precedente: il
     bersaglio si spostava insieme alla correzione e il punto d'arrivo era META' dello scarto
     vero (R1 verso -0.20 invece di -0.40 su G1-G5). Quella meta' faceva anche da freno contro il
     rumore — su G1-G5 R1 aveva tirato 2 rigori in tutto — e il freno ora e' esplicito:
     MIN_RIGORI tiri per tag prima di correggere qualcosa. */
  const scartoGrezzo = mediaOsservata - (motore.BONUS_PIAZZATI[tag] || 0);
  const obiettivo = Math.max(-LIMITE, Math.min(LIMITE, scartoGrezzo));
  const smorzato = prec + TASSO_APPRENDIMENTO * (obiettivo - prec);
  nuovaPiazzati[tag] = Math.round(smorzato * 1000) / 1000;
  dettaglioPiazzati[tag] = { n, tiri, campioneSufficiente: true, mediaOsservata, obiettivo, correzione: nuovaPiazzati[tag] };
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
console.log('  tag   n     tiri   bonus osservato   base      correzione precedente -> nuova');
for (const tag of TAG_RIGORI) {
  const d = dettaglioPiazzati[tag];
  if (!d.campioneSufficiente) {
    const perche = d.n < MIN_CAMPIONE ? `presenze sotto ${MIN_CAMPIONE}` : `tiri sotto ${MIN_RIGORI}`;
    console.log(`  ${tag}    ${String(d.n).padEnd(5)} ${String(d.tiri).padEnd(6)} (${perche}, invariata)    ${d.correzione.toFixed(3)}`);
  } else {
    console.log(
      `  ${tag}    ${String(d.n).padEnd(5)} ${String(d.tiri).padEnd(6)} ${d.mediaOsservata.toFixed(3).padStart(6)}            ${motore.BONUS_PIAZZATI[tag].toFixed(3)}     ` +
      `${(precedentePiazzati[tag]||0).toFixed(3)} -> ${d.correzione.toFixed(3)}`
    );
  }
}

console.log('\nScritto in dati/costanti.json.');
