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
import {
  VAPID_PUBLIC_KEY, ABBONAMENTO_DA_RIFARE, eTransitorio, inviaConRiprova, abbonamentoDaUsare, segnalaScaduto, rimedioScaduto
} from './notifiche.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');
const FILE_PROMEMORIA = join(QUI, '..', 'dati', 'promemoria.json');

/* Chiave pubblica, riprova sugli intoppi momentanei e da dove prendere l'abbonamento (prima il
   sito, poi il secret): in tools/notifiche.mjs, comuni con promemoria-scadenza.mjs (16/10). */

function leggiJson(percorso, fallback) {
  try { return JSON.parse(readFileSync(percorso, 'utf8')); }
  catch (e) { return fallback; }
}

async function main() {
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const SUB_RAW = process.env.PUSH_SUBSCRIPTION;
  const SITO_URL = process.env.NETLIFY_SITE_URL || '';

  if (!VAPID_PRIVATE_KEY || (!SUB_RAW && !SITO_URL)) {
    console.log('Notifiche non configurate (secret o indirizzo del sito mancanti): salto, non e un errore.');
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

  const { sub: subscription, fonte, motivo, perche, sito, disattivato } = await abbonamentoDaUsare(SITO_URL, SUB_RAW);
  if (!subscription) {
    /* Come in promemoria-scadenza.mjs: rosso solo per un secret rotto, altrimenti si riprova. */
    const grave = /JSON/.test(motivo);
    console.log((grave ? '::error::' : disattivato ? '' : '::warning::') + motivo);
    if (grave) process.exitCode = 1;
    return;
  }

  const { default: webpush } = await import('web-push');
  /* Il protocollo Web Push vuole un contatto nel messaggio, per uso dei servizi push in caso
     di abuso. Un URL pubblico del progetto vale quanto un'email per questo scopo, e con il
     repository ormai pubblico non mette in giro un indirizzo personale senza motivo. */
  /* Protetto come in promemoria-scadenza.mjs (27/09): una chiave malformata lancia un'eccezione
     con uno stack trace invece di un errore leggibile. */
  try {
    webpush.setVapidDetails(
      'https://github.com/Nicolodvt/Formazione-fantacalcio',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch (e) {
    console.error('VAPID_PRIVATE_KEY non valida:', e.message);
    process.exitCode = 1;
    return;
  }

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
  /* id: il service worker lo rimanda indietro come ricevuta (sw.js, 16/10). */
  const id = new Date().toISOString();
  const payload = JSON.stringify(infra ? {
    id,
    titolo: `Turno infrasettimanale — Giornata ${prob.giornata}`,
    corpo: `E' un turno infrasettimanale: si gioca gia' ${oraItaliana} (${prima.casa}-${prima.trasferta}). ` +
      `Schiera prima — questa settimana la preparazione e' compressa su lunedi e martedi.`
  } : {
    id,
    titolo: `Giornata ${prob.giornata}: schiera la formazione`,
    corpo: `Si comincia ${oraItaliana} con ${prima.casa}-${prima.trasferta}.`
  });

  try {
    await inviaConRiprova(webpush, subscription, payload);
    console.log('Promemoria spedito.');
  } catch (err) {
    /* 404/410 vuol dire che l'abbonamento non e' piu' valido (disiscritto, endpoint
       cambiato): non e' un guasto dello script. Qualsiasi altro errore invece e' un guasto vero. */
    /* 401/403 (chiavi che non corrispondono piu') hanno la stessa cura di 404/410. Prima finiva
       solo nel log: nessuna email, e il telefono smetteva di ricevere senza che si sapesse
       perche'. Ora il passo va in rosso — una volta per giornata, perche' sotto la giornata
       viene comunque segnata come avvisata e non si riprova. */
    /* 21/10: l'indirizzo del sito si segna morto li', e l'app se ne fa uno nuovo da sola. */
    if (ABBONAMENTO_DA_RIFARE.includes(err.statusCode)) {
      const segnalato = fonte === 'sito' && await segnalaScaduto(SITO_URL, subscription.endpoint, err.statusCode);
      console.log(`::error::Avviso di giornata non consegnato: il servizio push risponde ${err.statusCode} ` +
        '(indirizzo del telefono non piu valido). ' + rimedioScaduto(fonte, sito, perche, segnalato));
      process.exitCode = 1;
    } else if (eTransitorio(err)) {
      /* Niente scritto in dati/promemoria.json: l'avviso riparte al prossimo giro di dati.yml.
         Se il servizio push restasse giu' a lungo, lo segnala promemoria-scadenza.mjs. */
      console.log(`::warning::Avviso di giornata non spedito: servizio push non disponibile ` +
        `(${err.statusCode || err.message}). Riprovo al prossimo giro.`);
      return;
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
