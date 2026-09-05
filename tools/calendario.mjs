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
   lunedi e' gia' martedi in Italia, e viceversa vicino alla mezzanotte. Intl non ha un weekday
   "numeric": si passa dal nome in inglese e si cerca nell'elenco, ordinato apposta a partire
   da lunedi. */
const GIORNI = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function infrasettimanale(quando) {
  const nomeGiornoRoma = quando.toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'long' });
  return GIORNI.indexOf(nomeGiornoRoma) <= 3;   // lunedi(0)..giovedi(3)
}
