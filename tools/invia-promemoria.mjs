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
import { primaPartita, infrasettimanale } from './calendario.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');
const FILE_PROMEMORIA = join(QUI, '..', 'dati', 'promemoria.json');

/* Stessa chiave pubblica di index.html (const VAPID_PUBLIC_KEY). Non e' un segreto — e'
   proprio il suo scopo essere pubblica — quindi sta bene come costante invece che come
   secret in piu' da configurare. Se un giorno si rigenera la coppia, va cambiata in ENTRAMBI
   i posti insieme, altrimenti gli abbonamenti esistenti smettono di funzionare. */
const VAPID_PUBLIC_KEY = 'BHWwgaSHRz5TzxveQbvlZ6Cx__SgARqi_-hEXlD1g6Av-gYH_Y8cq48pY6-Zb2bcLlLNgDWwdFrDGn5M00ICRjM';

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

  /* Un turno che finisce lunedi-giovedi e' un turno infrasettimanale: la preparazione normale
     (concentrata fra mercoledi e venerdi per un turno che comincia il venerdi sera) non farebbe
     in tempo. Vedi .github/workflows/dati.yml per come lunedi e martedi restano abbastanza
     frequenti da coprire anche questo caso (e diventano orari quando serve, vedi
     turno-infrasettimanale.mjs). Si guarda tutto il turno (funzione in calendario.mjs), non solo
     "prima" qui sopra: un turno di weekend con un solo anticipo di giovedi non deve essere
     scambiato per infrasettimanale. */
  const infra = infrasettimanale(prob);

  /* La frase "turno infrasettimanale" compare parola per parola, sia nel titolo sia nel corpo:
     chiesto esplicitamente, cosi' resta leggibile anche se la notifica sul telefono mostra solo
     una delle due righe. */
  const payload = JSON.stringify(infra ? {
    titolo: `Turno infrasettimanale — Giornata ${prob.giornata}`,
    corpo: `E' un turno infrasettimanale: si gioca gia' ${oraItaliana} (${prima.casa}-${prima.trasferta}). ` +
      `Schiera prima — questa settimana la preparazione e' compressa su lunedi e martedi.`
  } : {
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
