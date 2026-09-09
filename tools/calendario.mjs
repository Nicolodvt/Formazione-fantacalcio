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

/* "venerdi 04 settembre, 20:45" -> Date. Niente anno nella stringa scaricata: si assume
   l'anno corrente, e se il risultato cade piu' di una settimana nel passato si prova l'anno
   successivo (giornate di campionato a cavallo di capodanno). */
export function parseData(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s+([a-zàèìòù]+),?\s+(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const [, giorno, meseNome, ore, minuti] = m;
  const mese = MESI[meseNome.toLowerCase()];
  if (mese == null) return null;
  const oggi = new Date();
  const anno = oggi.getFullYear();
  let d = new Date(anno, mese, +giorno, +ore, +minuti);
  if (d.getTime() < oggi.getTime() - 7 * 24 * 3600 * 1000) {
    d = new Date(anno + 1, mese, +giorno, +ore, +minuti);
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
