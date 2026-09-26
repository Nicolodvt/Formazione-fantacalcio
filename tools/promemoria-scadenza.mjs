#!/usr/bin/env node
/* Promemoria scaglionati verso la scadenza per schierare (24h, 12h, 6h, 2h, 1h, 30 minuti
   prima), che si fermano da soli appena segni "Ho schierato" nell'app.

   Il workflow (.github/workflows/promemoria.yml) dichiara un cron ogni 15 minuti, ma quello e'
   solo cio' che GitHub PROMETTE di provare a rispettare: sugli scheduled workflow reali il giro
   arriva con gap di ore, non minuti (verificato 15/09 sulle esecuzioni vere — vedi
   DIARIO-STORICO.md). Lo script quindi non assume mai di essere chiamato puntuale: ogni volta
   che scatta una soglia calcola e dichiara il tempo VERO rimasto alla scadenza, invece
   dell'etichetta nominale della soglia (formattaTempoRimanente sotto) — l'unico caso in cui
   rinuncia e' se la scadenza stessa e' gia' passata quando il giro arriva.

   NON tocca mai fantacalcio.it: legge solo dati/probabili.json gia sul disco, quindi non ha
   senso di cortesia da rispettare (a differenza degli scraper in dati.yml). E' un controllo
   economico — un file JSON e al massimo una chiamata alla funzione Netlify — non una nuova
   raccolta dati.

   Diverso da invia-promemoria.mjs: quello avvisa una volta sola che una giornata nuova si e
   aperta ("Giornata N: schiera la formazione"); questo insiste, scaglionato, SOLO se non hai
   ancora schierato. Restano entrambi, con scopi diversi. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { primaPartita, infrasettimanale } from './calendario.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');
const FILE_STATO = join(QUI, '..', 'dati', 'scadenza-promemoria.json');

const VAPID_PUBLIC_KEY = 'BHWwgaSHRz5TzxveQbvlZ6Cx__SgARqi_-hEXlD1g6Av-gYH_Y8cq48pY6-Zb2bcLlLNgDWwdFrDGn5M00ICRjM';

/* Stessi 5 minuti di margine usati dal countdown in index.html (MINUTI_SCADENZA): i due vanno
   tenuti allineati, altrimenti l'app mostrerebbe "scaduto" in un momento diverso da quando la
   Action smette di considerarti in ritardo. */
const MINUTI_SCADENZA = 5;

/* Risposte del servizio push che vogliono dire "questo abbonamento non funziona piu', riprovare
   non serve": 404/410 abbonamento scaduto o revocato, 401/403 chiavi VAPID che non
   corrispondono piu' a quelle con cui e' stato creato. In tutti e quattro i casi la cura e' la
   stessa: riattivare le notifiche dall'app e aggiornare il secret PUSH_SUBSCRIPTION. */
const ABBONAMENTO_DA_RIFARE = [401, 403, 404, 410];

/* Le sei soglie chieste, in ore prima della scadenza (non del calcio d'inizio). L'ordine qui
   e' solo espositivo: ogni soglia si valuta per conto suo, non in sequenza. */
const SOGLIE = [
  { chiave: '24h', ore: 24 },
  { chiave: '12h', ore: 12 },
  { chiave: '6h', ore: 6 },
  { chiave: '2h', ore: 2 },
  { chiave: '1h', ore: 1 },
  { chiave: '30m', ore: 0.5 }
];

function leggiJson(percorso, fallback) {
  try { return JSON.parse(readFileSync(percorso, 'utf8')); }
  catch (e) { return fallback; }
}

/* Chiede alla funzione Netlify se questa giornata e gia segnata come schierata. Fallisce
   "aperto" (assume NON schierato) se la funzione non risponde: il sito potrebbe non essere
   ancora pubblicato, o essere temporaneamente giu. Tacere un promemoria per un dubbio tecnico
   sarebbe peggio che mandarne uno di troppo — l'intera ragion d'essere di questo script e
   avvisare, non il contrario. */
async function eGiaSchierato(sitoUrl, giornata) {
  if (!sitoUrl) {
    console.log('NETLIFY_SITE_URL non impostato: non posso verificare "schierato", procedo come se non lo fosse.');
    return false;
  }
  try {
    const r = await fetch(`${sitoUrl.replace(/\/$/, '')}/.netlify/functions/schierato?giornata=${giornata}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const d = await r.json();
    return !!d.schierato;
  } catch (e) {
    console.log('Funzione "schierato" non raggiungibile (' + e.message + '): procedo come se non fosse schierato.');
    return false;
  }
}

/* Il testo del promemoria riporta il tempo REALE rimasto alla scadenza, non l'etichetta
   nominale della soglia scattata (24h/12h/...): il cron gira ogni 15 minuti solo sulla carta —
   verificato il 15/09 confrontando le esecuzioni reali (gh api .../runs): gap tipici di 2-6 ore,
   non minuti, comuni a tutti gli scheduled workflow GitHub su repository non enterprise. Dire
   "mancano 24 ore" quando il giro e' arrivato con 5 ore di ritardo (quindi ne mancano 19) sarebbe
   fuorviante quanto non dire nulla — l'unico modo onesto e' calcolare lo scarto vero al momento
   dell'invio, qualunque soglia lo abbia fatto scattare. */
function formattaTempoRimanente(ms) {
  const minuti = Math.round(ms / 60000);
  if (minuti <= 1) return 'un minuto';
  if (minuti < 60) return minuti + ' minuti';
  const ore = Math.round(minuti / 60);
  if (ore <= 1) return 'un\'ora';
  return ore + ' ore';
}

async function main() {
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const SUB_RAW = process.env.PUSH_SUBSCRIPTION;
  const SITO_URL = process.env.NETLIFY_SITE_URL || '';

  if (!VAPID_PRIVATE_KEY || !SUB_RAW) {
    console.log('Notifiche non configurate (secret mancanti): salto, non e un errore.');
    return;
  }

  const prob = leggiJson(FILE_PROB, null);
  if (!prob || prob.giornata == null) {
    console.log('Nessuna probabili valida in dati/probabili.json: salto.');
    return;
  }

  const prima = primaPartita(prob);
  if (!prima) {
    console.log('Nessuna data di partita leggibile: salto.');
    return;
  }
  const scadenza = new Date(prima.quando.getTime() - MINUTI_SCADENZA * 60000);
  const ora = new Date();

  let stato = leggiJson(FILE_STATO, { giornata: null, inviate: {} });
  /* Giornata nuova rispetto all'ultima registrata: si riparte da zero, le soglie di una
     giornata passata non hanno piu senso per quella nuova. */
  if (stato.giornata !== prob.giornata) stato = { giornata: prob.giornata, inviate: {} };

  const daInviare = SOGLIE.find(s => {
    if (stato.inviate[s.chiave]) return false;
    const momento = new Date(scadenza.getTime() - s.ore * 3600000);
    return ora >= momento;
  });

  if (!daInviare) {
    console.log('Nessuna soglia da valutare in questo momento.');
    return;
  }

  /* L'unico caso in cui vale davvero la pena rinunciare: la scadenza stessa e' gia' passata (il
     giro e' arrivato dopo il calcio d'inizio, non solo dopo la soglia nominale). Prima di questo
     fix qualunque ritardo oltre 20 minuti — la norma con un cron reale da ore, non minuti —
     faceva scartare la soglia senza mai spedire nulla: e' il motivo per cui la giornata 4 non ha
     mandato NESSUNO dei sei promemoria (verificato in dati/scadenza-promemoria.json: tutti
     "saltata"). */
  if (ora >= scadenza) {
    console.log(`Soglia ${daInviare.chiave}: la scadenza e' gia' passata, la segno saltata senza mandare nulla.`);
    stato.inviate[daInviare.chiave] = 'saltata';
    writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
    return;
  }

  if (await eGiaSchierato(SITO_URL, prob.giornata)) {
    console.log(`Soglia ${daInviare.chiave}: gia schierato, salto senza mandare nulla.`);
    stato.inviate[daInviare.chiave] = 'saltata-schierato';
    writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
    return;
  }

  let subscription;
  try { subscription = JSON.parse(SUB_RAW); }
  catch (e) { console.error('Il secret PUSH_SUBSCRIPTION non e un JSON valido.'); process.exitCode = 1; return; }

  const { default: webpush } = await import('web-push');
  /* setVapidDetails lancia un'eccezione non gestita se la chiave privata e malformata (l'ho
     visto io stesso mandando una chiave finta in prova): li' finirebbe l'intero processo con
     uno stack trace, non un errore pulito. Su invia-promemoria.mjs capitava raramente (poche
     esecuzioni a settimana); qui il workflow gira ogni 15 minuti, quindi vale la pena blindarlo
     davvero invece di limitarsi a sperare che la chiave sia sempre giusta. */
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

  const infra = infrasettimanale(prob);
  const oraItaliana = prima.quando.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });

  const payload = JSON.stringify({
    titolo: `Mancano ${formattaTempoRimanente(scadenza.getTime() - ora.getTime())}: schiera la formazione`,
    corpo: (infra ? 'Turno infrasettimanale — ' : '') +
      `Giornata ${prob.giornata}, si comincia ${oraItaliana} (${prima.casa}-${prima.trasferta}). Non hai ancora segnato la formazione.`
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log(`Promemoria ${daInviare.chiave} spedito.`);
    stato.inviate[daInviare.chiave] = ora.toISOString();
  } catch (err) {
    if (ABBONAMENTO_DA_RIFARE.includes(err.statusCode)) {
      /* Prima questo caso finiva solo nel log e la soglia veniva segnata con l'orario, come se
         fosse partita: il telefono non riceveva nulla e da fuori non lo si poteva capire. Ora
         resta scritto nel file di stato e il workflow va in rosso UNA volta per giornata (il
         flag riparte da zero con la giornata nuova): un'email sola, non una per soglia. */
      stato.inviate[daInviare.chiave] = 'abbonamento-scaduto';
      if (!stato.abbonamentoScadutoSegnalato) {
        stato.abbonamentoScadutoSegnalato = true;
        console.log(`::error::Promemoria non consegnato: il servizio push risponde ${err.statusCode} ` +
          '(abbonamento scaduto o chiavi cambiate). Riattiva le notifiche dall app (Impostazioni -> Notifiche) ' +
          'e aggiorna il secret PUSH_SUBSCRIPTION.');
        process.exitCode = 1;
      } else {
        console.log(`Abbonamento ancora non valido (${err.statusCode}), gia segnalato per questa giornata.`);
      }
    } else {
      console.error('Invio fallito:', err.statusCode, err.body || err.message);
      process.exitCode = 1;
      return;
    }
  }

  writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
}

main();
