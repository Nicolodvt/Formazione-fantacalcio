#!/usr/bin/env node
/* Manda un promemoria push quando si apre una giornata nuova, con l'orario della prima
   partita. Gira dentro .github/workflows/dati.yml, subito dopo aver riscaricato le probabili.

   Se i secret non sono ancora impostati (l'utente non ha ancora attivato le notifiche
   dall'app, o non le vuole) esce senza errore: e' un extra sopra lo scraper dei dati, non
   deve poter far fallire il resto del workflow.

   Un promemoria per giornata, non uno per ogni giro di scraper: dati/promemoria.json tiene
   il numero dell'ultima giornata gia' avvisata, cosi i 7 giri a settimana non spediscono
   7 notifiche identiche. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');
const FILE_PROMEMORIA = join(QUI, '..', 'dati', 'promemoria.json');

/* Stessa chiave pubblica di index.html (const VAPID_PUBLIC_KEY). Non e' un segreto — e'
   proprio il suo scopo essere pubblica — quindi sta bene come costante invece che come
   secret in piu' da configurare. Se un giorno si rigenera la coppia, va cambiata in ENTRAMBI
   i posti insieme, altrimenti gli abbonamenti esistenti smettono di funzionare. */
const VAPID_PUBLIC_KEY = 'BHWwgaSHRz5TzxveQbvlZ6Cx__SgARqi_-hEXlD1g6Av-gYH_Y8cq48pY6-Zb2bcLlLNgDWwdFrDGn5M00ICRjM';

const MESI = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11
};

/* "venerdi 04 settembre, 20:45" -> Date. Niente anno nella stringa scaricata: si assume
   l'anno corrente, e se il risultato cade piu' di una settimana nel passato si prova l'anno
   successivo (giornate di campionato a cavallo di capodanno). */
function parseData(s) {
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

function primaPartita(prob) {
  let prima = null;
  for (const p of prob.partite || []) {
    const quando = parseData(p.data);
    if (!quando) continue;
    if (!prima || quando < prima.quando) prima = { quando, casa: p.casa, trasferta: p.trasferta };
  }
  return prima;
}

function leggiJson(percorso, fallback) {
  try { return JSON.parse(readFileSync(percorso, 'utf8')); }
  catch (e) { return fallback; }
}

async function main() {
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const SUB_RAW = process.env.PUSH_SUBSCRIPTION;

  if (!VAPID_PRIVATE_KEY || !SUB_RAW) {
    console.log('Notifiche non configurate (secret mancanti): salto, non e un errore.');
    return;
  }

  const prob = leggiJson(FILE_PROB, null);
  if (!prob || prob.giornata == null) {
    console.log('Nessuna probabili valida in dati/probabili.json: salto.');
    return;
  }

  const promemoria = leggiJson(FILE_PROMEMORIA, { ultimaGiornataAvvisata: null });
  if (promemoria.ultimaGiornataAvvisata === prob.giornata) {
    console.log(`Giornata ${prob.giornata} gia avvisata: salto.`);
    return;
  }

  const prima = primaPartita(prob);
  if (!prima) {
    console.log('Nessuna data di partita leggibile nel file: salto.');
    return;
  }

  let subscription;
  try { subscription = JSON.parse(SUB_RAW); }
  catch (e) { console.error('Il secret PUSH_SUBSCRIPTION non e un JSON valido.'); process.exitCode = 1; return; }

  const { default: webpush } = await import('web-push');
  /* Il protocollo Web Push vuole un contatto nel messaggio, per uso dei servizi push in caso
     di abuso. Un URL pubblico del progetto vale quanto un'email per questo scopo, e con il
     repository ormai pubblico non mette in giro un indirizzo personale senza motivo. */
  webpush.setVapidDetails(
    'https://github.com/Nicolodvt/Formazione-fantacalcio',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const oraItaliana = prima.quando.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });
  const payload = JSON.stringify({
    titolo: `Giornata ${prob.giornata}: schiera la formazione`,
    corpo: `Si comincia ${oraItaliana} con ${prima.casa}-${prima.trasferta}.`
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('Promemoria spedito.');
  } catch (err) {
    /* 404/410 vuol dire che l'abbonamento non e' piu' valido (disiscritto, endpoint
       cambiato): non e' un guasto dello script, serve solo ri-attivare dall'app e
       aggiornare il secret. Qualsiasi altro errore invece e' un guasto vero. */
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log('Abbonamento scaduto o non valido: va ri-attivato dall app.');
    } else {
      console.error('Invio fallito:', err.statusCode, err.body || err.message);
      process.exitCode = 1;
      return;
    }
  }

  writeFileSync(
    FILE_PROMEMORIA,
    JSON.stringify({ ultimaGiornataAvvisata: prob.giornata, inviato: new Date().toISOString() }, null, 1) + '\n'
  );
}

main();
