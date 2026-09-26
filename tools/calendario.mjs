/* Calcolo condiviso su quando comincia una giornata, e se e' un turno infrasettimanale
   (comincia lunedi-giovedi invece che nel weekend). Usato sia da invia-promemoria.mjs (per
   scegliere il testo del promemoria) sia da turno-infrasettimanale.mjs (per decidere se il
   giro extra del martedi in .github/workflows/dati.yml deve davvero controllare
   fantacalcio.it). Tenerlo in un solo posto evita che i due finiscano per calcolare il giorno
   in due modi leggermente diversi. */

const MESI = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11
};

/* Quanto l'ora di Roma e' avanti rispetto a UTC nell'istante t (ms): +1h d'inverno, +2h
   d'estate. Letto dal database dei fusi di Node, non calcolato a mano: il cambio d'ora non
   cade sempre lo stesso giorno. */
function scartoRoma(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
}

/* Ora scritta sul sito (ora italiana) -> istante vero, QUALUNQUE sia il fuso del processo.
   Prima si usava new Date(anno, mese, ...), che legge l'ora nel fuso della macchina: giusto sul
   PC di casa, sbagliato di 2 ore sui runner GitHub (che girano in UTC). Scoperto il 26/09 dai
   promemoria della giornata 5: il "2h" e' partito alle 19:52 UTC dicendo "mancano 48 minuti",
   un'ora DOPO il calcio d'inizio vero (20:45 italiane = 18:45 UTC). Il secondo giro di
   scartoRoma serve solo a ridosso del cambio d'ora, quando lo scarto cambia fra la stima e il
   risultato. */
function daOraRoma(anno, mese, giorno, ore, minuti) {
  const comeSeFosseUtc = Date.UTC(anno, mese, giorno, ore, minuti);
  let t = comeSeFosseUtc - scartoRoma(comeSeFosseUtc);
  t = comeSeFosseUtc - scartoRoma(t);
  return new Date(t);
}

/* "venerdi 04 settembre, 20:45" -> Date. Niente anno nella stringa scaricata: fra l'anno
   prima, quello corrente e quello dopo si prende la data PIU' VICINA a oggi — le date delle
   probabili sono sempre a pochi giorni o settimane di distanza, mai a mesi.
   Fino al 27/09 la regola era "anno corrente, e se cade piu' di una settimana nel passato
   l'anno dopo": pensata per una data di gennaio letta a dicembre, sbagliava il caso opposto.
   Il 2 gennaio una partita del 30 dicembre diventava il 30 dicembre dell'anno DOPO (giorno
   della settimana sbagliato, quindi anche il turno infrasettimanale), e qualunque data passata
   da piu' di 7 giorni saltava avanti di un anno. Trovato da tools/prove-pipeline.mjs.
   La gemella parseDataPartita() in index.html legge invece l'ora nel fuso del telefono: li'
   va bene cosi', il telefono e' in Italia. Se cambia il formato della data va aggiornata anche
   quella. */
export function parseData(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s+([a-zàèìòù]+),?\s+(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const [, giorno, meseNome, ore, minuti] = m;
  const mese = MESI[meseNome.toLowerCase()];
  if (mese == null) return null;
  const oggi = new Date();
  const anno = oggi.getFullYear();
  let d = null;
  for (const a of [anno - 1, anno, anno + 1]) {
    const c = daOraRoma(a, mese, +giorno, +ore, +minuti);
    if (!d || Math.abs(c - oggi) < Math.abs(d - oggi)) d = c;
  }
  return d;
}

export function primaPartita(prob) {
  let prima = null;
  for (const p of prob.partite || []) {
    const quando = parseData(p.data);
    if (!quando) continue;
    if (!prima || quando < prima.quando) prima = { quando, casa: p.casa, trasferta: p.trasferta };
  }
  return prima;
}

/* Il giorno si legge nel fuso di Roma, non in UTC/del server: una partita delle 00:30 UTC di
   lunedi e' gia' martedi in Italia, e viceversa vicino alla mezzanotte. */
function nomeGiornoRoma(quando) {
  return quando.toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'long' });
}

/* Un turno di weekend normale finisce spesso di lunedi (Cagliari-Lecce e Udinese-Lazio, nella
   giornata 3, giocano proprio di lunedi sera): "l'ultima partita cade lunedi" NON basta a dire
   infrasettimanale, la prima bozza di questa funzione sbagliava esattamente su questo, verificato
   sui dati veri della giornata 3. Il vero segno distintivo e' un altro: un turno infrasettimanale
   non tocca MAI venerdi/sabato/domenica — e' tutto compresso fra lunedi e giovedi. Un turno di
   weekend con un anticipo spostato al giovedi resta comunque un turno di weekend, perche' il
   grosso delle partite sta ancora nel weekend vero. */
export function infrasettimanale(prob) {
  const partite = (prob.partite || []).map(p => parseData(p.data)).filter(Boolean);
  if (!partite.length) return false;
  const WEEKEND = ['Friday', 'Saturday', 'Sunday'];
  return !partite.some(quando => WEEKEND.includes(nomeGiornoRoma(quando)));
}
