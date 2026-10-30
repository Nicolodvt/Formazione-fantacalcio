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
import { primaPartita, infrasettimanale, scadenzaDi } from './calendario.mjs';
import {
  VAPID_PUBLIC_KEY, ABBONAMENTO_DA_RIFARE, eTransitorio, inviaConRiprova, abbonamentoDaUsare, statoSito,
  segnalaScaduto, rimedioScaduto, urlSito, opzioniPromemoria
} from './notifiche.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');
const FILE_STATO = join(QUI, '..', 'dati', 'scadenza-promemoria.json');

/* Scadenza = calcio d'inizio meno MINUTI_SCADENZA (scadenzaDi in calendario.mjs, allineata al
   countdown di index.html). */

/* Chiave pubblica, risposte da "abbonamento da rifare", riprova sugli intoppi momentanei:
   in tools/notifiche.mjs, comuni con invia-promemoria.mjs. */
/* Giri di fila con il servizio push irraggiungibile prima di andare in rosso: con il cron vero
   (un giro ogni ~4 ore) sono circa 8-12 ore. Una volta sola per giornata, come l'abbonamento. */
const TRANSITORI_PRIMA_DEL_ROSSO = 3;

/* Ore dopo un invio senza ricevuta dal telefono prima di andare in rosso (16/10). La notifica
   aspetta il telefono anche se e' spento o senza rete (il servizio push la tiene per settimane):
   12 ore coprono una notte e un viaggio, non una settimana di silenzio come a settembre. */
const ORE_SENZA_RICEVUTA = 12;

/* Dal 24/10 un promemoria vale solo fino alla scadenza (TTL, opzioniPromemoria): se il telefono
   non lo prende entro allora il servizio push lo butta, e la ricevuta non arrivera' mai. Quindi
   il verdetto si da' alla scadenza (piu' un margine per la ricevuta), non dopo 12 ore fisse. */
const MINUTI_MARGINE_RICEVUTA = 15;

/* Promemoria non arrivati di fila prima di andare in rosso (30/10). Uno solo vuol dire telefono
   spento o senza rete in quelle ore (il 3h del 27/10, 15:30 italiane, mentre il 24h della sera
   prima era arrivato in 9 minuti): un avviso, non un'email di "non funziona". Due di fila sono un
   guasto vero (telefono scollegato, Chrome limitato dal risparmio energetico). Il contatore passa
   da una giornata all'altra e si azzera alla prima ricevuta. */
const PERSI_PRIMA_DEL_ROSSO = 2;

/* Entro quando deve arrivare la ricevuta dell'invio u (ms). Senza "scade" (stati scritti prima
   del 30/10) vale la regola vecchia delle 12 ore. */
function limiteRicevuta(u) {
  const limite = Date.parse(u.quando) + ORE_SENZA_RICEVUTA * 3600000;
  return u.scade ? Math.min(limite, Date.parse(u.scade) + MINUTI_MARGINE_RICEVUTA * 60000) : limite;
}

/* Verdetto "non arrivato" sull'ultimo invio: avviso al primo, rosso (una volta per giornata) dal
   secondo di fila. */
function segnaNonArrivato(stato, u, entroQuando) {
  u.esito = 'non arrivata';
  stato.persiDiFila = (stato.persiDiFila || 0) + 1;
  const quale = `Il promemoria del ${u.id} non e' arrivato sul telefono ${entroQuando}`;
  if (stato.persiDiFila < PERSI_PRIMA_DEL_ROSSO) {
    console.log(`::warning::${quale}: probabilmente spento o senza rete in quelle ore. Primo di fila, nessuna email; ` +
      'al secondo di fila il giro va in rosso.');
    return;
  }
  if (stato.ricevutaSegnalata) {
    console.log(`::warning::${quale} (${stato.persiDiFila} di fila, gia' segnalato per questa giornata).`);
    return;
  }
  stato.ricevutaSegnalata = true;
  console.log(`::error::${quale}, ed e' il ${stato.persiDiFila}° di fila. Apri l app con la rete (Impostazioni -> ` +
    'Notifiche): deve dire "collegato a questo telefono", se no tocca Ricollega. Se lo dice gia\', sul telefono: ' +
    'Impostazioni -> App -> Chrome -> Batteria -> "Senza limitazioni".');
  process.exitCode = 1;
}

/* true se in questo giro il sito ha risposto alla lettura delle ricevute: senza, un invio non
   confermato non si puo' dare per perso (non lo sappiamo). */
let ricevuteLette = false;

/* La ricevuta dell'ultimo invio (16/10): il service worker la scrive sul sito appena mostra la
   notifica (sw.js). Fino a settembre "spedito" voleva dire solo "accettato dal servizio push": per
   settimane nessuna notifica e' arrivata sul telefono e nessuno poteva saperlo. Solo per gli
   abbonamenti presi dal sito: quello del secret puo' essere di un telefono con l'app vecchia,
   che le ricevute non le manda. Restituisce true se lo stato e' cambiato. */
async function controllaRicevuta(stato, sitoUrl, ora) {
  const u = stato.ultimoInvio;
  if (!u || u.confermato || u.esito || u.fonte !== 'sito') return false;
  const sito = await statoSito(sitoUrl);
  if (!sito) return false;
  ricevuteLette = true;
  const ric = sito.ricevuta;
  if (ric && ric.id === u.id) {
    u.confermato = ric.quando;
    u.esito = ric.esito;
    delete stato.persiDiFila;
    if (ric.esito === 'mostrata') {
      console.log(`Il telefono ha confermato il promemoria del ${u.id} (alle ${ric.quando}).`);
    } else if (!stato.ricevutaSegnalata) {
      stato.ricevutaSegnalata = true;
      console.log(`::error::Il promemoria del ${u.id} e' arrivato sul telefono ma non e' stato mostrato (${ric.esito}). ` +
        'Controlla che le notifiche dell app siano permesse nelle impostazioni del telefono.');
      process.exitCode = 1;
    }
    return true;
  }
  /* Sul sito c'e' posto per una ricevuta sola: se dopo questo invio il telefono ha mostrato
     un'altra notifica (l'avviso di giornata nuova, una prova a mano), quella ha preso il posto
     della nostra. Il telefono pero' era raggiungibile e la catena funzionava: non e' un guasto. */
  if (ric && ric.esito === 'mostrata' && Date.parse(ric.quando) >= Date.parse(u.quando)) {
    u.confermato = ric.quando;
    u.esito = 'mostrata (ricevuta sostituita da quella di ' + ric.id + ')';
    delete stato.persiDiFila;
    console.log(`Nessuna ricevuta col proprio id per il promemoria del ${u.id}, ma il telefono ha mostrato ` +
      `un'altra notifica dopo (${ric.id}, alle ${ric.quando}): raggiungibile.`);
    return true;
  }
  if (ora.getTime() > limiteRicevuta(u)) {
    segnaNonArrivato(stato, u, u.scade && limiteRicevuta(u) < Date.parse(u.quando) + ORE_SENZA_RICEVUTA * 3600000
      ? 'prima della scadenza (dopo il servizio push lo scarta)' : `in ${ORE_SENZA_RICEVUTA} ore`);
    return true;
  }
  return false;
}

/* Soglie in ore prima della scadenza (non del calcio d'inizio), in ordine decrescente: se
   piu' d'una scatta nello stesso giro vale l'ultima (la piu' vicina), vedi "dovute" in main().
   Rifatte il 27/09 (l'utente: "correggi tu gli intervalli, li ho sparati a caso"). Prima erano
   sei (24h, 12h, 6h, 2h, 1h, 30m), pensate per un cron ogni 15 minuti; quello vero gira in
   media ogni 3,8 ore (mediana 228 minuti su 112 giri, 09-26/09), quindi 1h e 30m quasi non
   partivano mai e 12h/6h/2h arrivavano a coppie. Ora tre momenti con uno scopo ciascuno:
   - 24h "domani si gioca": c'e' tutto il tempo per guardare le probabili;
   - 8h  "oggi si gioca": la mattina stessa (con il silenzio notturno sotto);
   - 3h  ultima chiamata: con giri ogni ~4 ore arriva prima della scadenza circa 3 volte su 4,
         una soglia a 1h ci riusciva circa 1 volta su 4.
   Prima ancora c'e' l'avviso "giornata nuova" di invia-promemoria.mjs, giorni prima. */
/* 72h e 48h (27/09, utente): per una giornata del weekend cadono mercoledi/giovedi, cosi' si
   schiera una formazione di sicurezza in anticipo anche se il venerdi non si guarda il telefono. */
const SOGLIE = [
  { chiave: '72h', ore: 72 },
  { chiave: '48h', ore: 48 },
  { chiave: '24h', ore: 24 },
  { chiave: '8h', ore: 8 },
  { chiave: '3h', ore: 3 }
];

/* Silenzio notturno (ora italiana): una soglia che scatta di notte aspetta il primo giro dopo
   le 8. Non si perde: resta "dovuta" e parte al mattino (o viene assorbita dalla successiva). */
const NOTTE_DALLE = 23, NOTTE_ALLE = 8;
function eNotteInItalia(t) {
  const ore = +new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hourCycle: 'h23' })
    .format(t);
  return ore >= NOTTE_DALLE || ore < NOTTE_ALLE;
}

function leggiJson(percorso, fallback) {
  try { return JSON.parse(readFileSync(percorso, 'utf8')); }
  catch (e) { return fallback; }
}

/* Chiede alla funzione Netlify se questa giornata e gia segnata come schierata. Fallisce
   "aperto" (assume NON schierato) se la funzione non risponde: il sito potrebbe non essere
   ancora pubblicato, o essere temporaneamente giu. Tacere un promemoria per un dubbio tecnico
   sarebbe peggio che mandarne uno di troppo — l'intera ragion d'essere di questo script e
   avvisare, non il contrario. */
/* Gli avvisi ::warning:: (27/09) finiscono fra le annotazioni del giro: prima un URL mancante
   o una funzione che risponde male passavano in silenzio, e "Ho schierato" smetteva di
   fermare i promemoria senza che nessuno se ne accorgesse. */
async function eGiaSchierato(sitoUrl, giornata) {
  if (!sitoUrl) {
    console.log('::warning::NETLIFY_SITE_URL non impostato: "Ho schierato" non puo fermare i promemoria.');
    return false;
  }
  try {
    const r = await fetch(`${sitoUrl.replace(/\/$/, '')}/.netlify/functions/schierato?giornata=${giornata}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.log(`::warning::Funzione "schierato" risponde ${r.status}: procedo come se non fosse schierato.`);
      return false;
    }
    const d = await r.json();
    if (typeof d.schierato !== 'boolean') {
      console.log('::warning::Funzione "schierato": risposta senza il campo "schierato", procedo come se non lo fosse.');
    }
    return !!d.schierato;
  } catch (e) {
    /* Avviso, non riga semplice (21/10): con NETLIFY_SITE_URL senza "https://" questa riga e'
       comparsa a ogni promemoria per settimane, e da fuori (annotazioni) non si vedeva. */
    console.log('::warning::Funzione "schierato" non raggiungibile (' + e.message + '): procedo come se non fosse schierato.');
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
  const SITO_URL = urlSito(process.env.NETLIFY_SITE_URL);

  if (!VAPID_PRIVATE_KEY || (!SUB_RAW && !SITO_URL)) {
    console.log('Notifiche non configurate (secret o indirizzo del sito mancanti): salto, non e un errore.');
    return;
  }

  /* Notifica di prova (27/09): lanciando il workflow a mano con "prova" spuntato parte subito
     una notifica, senza soglie e senza toccare lo stato. Unico modo di sapere davvero che la
     catena arriva fino al telefono: 201 e notifica = tutto bene; 404/410 = abbonamento da rifare. */
  if (process.env.PROVA === 'true') {
    const { sub, fonte, motivo, sito, perche } = await abbonamentoDaUsare(SITO_URL, SUB_RAW);
    if (!sub) { console.log('::error::' + motivo); process.exitCode = 1; return; }
    const { default: webpush } = await import('web-push');
    const id = 'prova-' + new Date().toISOString();
    try {
      webpush.setVapidDetails('https://github.com/Nicolodvt/Formazione-fantacalcio', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const r = await webpush.sendNotification(sub, JSON.stringify({
        titolo: 'Prova notifica',
        corpo: 'Se leggi questo, i promemoria arrivano sul telefono.',
        id
      }), opzioniPromemoria(10 * 60000));  // come un promemoria vero; dopo 10 minuti non serve piu'
      console.log(`Notifica di prova accettata dal servizio push (${r && r.statusCode}). Controlla il telefono.`);
    } catch (err) {
      const morto = ABBONAMENTO_DA_RIFARE.includes(err.statusCode);
      const segnalato = morto && fonte === 'sito' && await segnalaScaduto(SITO_URL, sub.endpoint, err.statusCode);
      console.log(`::error::Notifica di prova rifiutata (${err.statusCode || err.message}). ` +
        (morto ? 'Indirizzo del telefono non piu valido. ' + rimedioScaduto(fonte, sito, perche, segnalato)
          : 'Controlla la chiave VAPID_PRIVATE_KEY.'));
      process.exitCode = 1;
      return;
    }
    /* Con l'abbonamento del sito si aspetta la ricevuta del telefono (16/10): e' la prova che la
       notifica e' arrivata davvero, non solo che il servizio push l'ha presa. */
    if (fonte !== 'sito') {
      console.log('Abbonamento dal secret: nessuna ricevuta da aspettare, guarda il telefono.');
      return;
    }
    /* Nove controlli a 10 secondi: un telefono acceso e online risponde in pochi secondi. */
    const pausa = +(process.env.ATTESA_RICEVUTA_PAUSA_MS ?? 10000);
    for (let i = 0; i < 9; i++) {
      await new Promise(r => setTimeout(r, pausa));
      const sito = await statoSito(SITO_URL);
      if (sito && sito.ricevuta && sito.ricevuta.id === id) {
        if (sito.ricevuta.esito === 'mostrata') console.log('Il telefono ha confermato: notifica arrivata e mostrata.');
        else { console.log(`::error::Arrivata sul telefono ma non mostrata (${sito.ricevuta.esito}): controlla i permessi delle notifiche.`); process.exitCode = 1; }
        return;
      }
    }
    console.log('::error::Nessuna conferma dal telefono: la notifica e\' stata accettata dal servizio push ma il telefono ' +
      'non l\'ha ricevuta (spento, senza rete, o l app aperta da un altro indirizzo). Se il telefono era acceso e online, ' +
      'apri l app, Impostazioni -> Notifiche, tocca Ricollega e rilancia la prova.');
    process.exitCode = 1;
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
  const scadenza = scadenzaDi(prima);
  const ora = new Date();

  let stato = leggiJson(FILE_STATO, { giornata: null, inviate: {} });
  /* Giornata nuova rispetto all'ultima registrata: si riparte da zero, le soglie di una
     giornata passata non hanno piu senso per quella nuova. Restano (30/10) il conto dei
     promemoria non arrivati di fila e l'ultimo invio se aspetta ancora il verdetto. */
  if (stato.giornata !== prob.giornata) {
    const u = stato.ultimoInvio;
    stato = {
      giornata: prob.giornata, inviate: {},
      ...(stato.persiDiFila ? { persiDiFila: stato.persiDiFila } : {}),
      ...(u && !u.confermato && !u.esito ? { ultimoInvio: u } : {})
    };
  }
  const salvaStato = () => writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
  if (await controllaRicevuta(stato, SITO_URL, ora)) salvaStato();

  /* Tutte le soglie gia' raggiunte e non ancora trattate; se sono piu' d'una (il giro e' arrivato
     con ore di ritardo) si manda SOLO la piu' vicina alla scadenza e le altre si segnano
     "superata" (27/09). Prima si mandava la piu' vecchia, e le altre ai giri successivi: con il
     cron in ritardo una coda di promemoria uno dopo l'altro ("mancano 4 ore", poi "mancano 3
     ore"...) invece di uno solo. SOGLIE e' in ordine di ore decrescenti: l'ultima e' la piu' vicina. */
  const dovute = SOGLIE.filter(s => {
    if (stato.inviate[s.chiave]) return false;
    const momento = new Date(scadenza.getTime() - s.ore * 3600000);
    return ora >= momento;
  });
  const daInviare = dovute[dovute.length - 1];
  const segnaDovute = (valore) => {
    for (const s of dovute) stato.inviate[s.chiave] = s === daInviare ? valore : 'superata';
  };

  if (!daInviare) {
    console.log('Nessuna soglia da valutare in questo momento.');
    return;
  }
  if (dovute.length > 1) {
    console.log(`Soglie raggiunte insieme: ${dovute.map(s => s.chiave).join(', ')} — vale solo ${daInviare.chiave}.`);
  }

  /* L'unico caso in cui vale davvero la pena rinunciare: la scadenza stessa e' gia' passata (il
     giro e' arrivato dopo il calcio d'inizio, non solo dopo la soglia nominale). Prima di questo
     fix qualunque ritardo oltre 20 minuti — la norma con un cron reale da ore, non minuti —
     faceva scartare la soglia senza mai spedire nulla: e' il motivo per cui la giornata 4 non ha
     mandato NESSUNO dei sei promemoria (verificato in dati/scadenza-promemoria.json: tutti
     "saltata"). */
  if (ora >= scadenza) {
    console.log(`Soglia ${daInviare.chiave}: la scadenza e' gia' passata, la segno saltata senza mandare nulla.`);
    for (const s of dovute) stato.inviate[s.chiave] = 'saltata';
    writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
    return;
  }

  if (eNotteInItalia(ora)) {
    console.log(`Soglia ${daInviare.chiave} dovuta, ma e' notte in Italia: aspetto il primo giro dopo le ${NOTTE_ALLE}.`);
    return;
  }

  if (await eGiaSchierato(SITO_URL, prob.giornata)) {
    console.log(`Soglia ${daInviare.chiave}: gia schierato, salto senza mandare nulla.`);
    for (const s of dovute) stato.inviate[s.chiave] = 'saltata-schierato';
    writeFileSync(FILE_STATO, JSON.stringify(stato, null, 1) + '\n');
    return;
  }

  const { sub: subscription, fonte, motivo, perche, sito, disattivato } = await abbonamentoDaUsare(SITO_URL, SUB_RAW);
  if (!subscription) {
    /* Secret rotto: guasto vero. Nessun abbonamento da nessuna parte (sito giu', app non ancora
       collegata): avviso, si riprova al giro dopo. Spenti dall'utente: solo una riga. */
    const grave = /JSON/.test(motivo);
    console.log((grave ? '::error::' : disattivato ? '' : '::warning::') + motivo);
    if (grave) process.exitCode = 1;
    return;
  }

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
    id: ora.toISOString(),
    titolo: `Mancano ${formattaTempoRimanente(scadenza.getTime() - ora.getTime())}: schiera la formazione`,
    corpo: (infra ? 'Turno infrasettimanale — ' : '') +
      `Giornata ${prob.giornata}, si comincia ${oraItaliana} (${prima.casa}-${prima.trasferta}). Non hai ancora segnato la formazione.`
  });

  const opzioni = opzioniPromemoria(scadenza.getTime() - ora.getTime());
  try {
    await inviaConRiprova(webpush, subscription, payload, opzioni);
    console.log(`Promemoria ${daInviare.chiave} spedito.`);
    segnaDovute(ora.toISOString());
    delete stato.erroriInvio;
    /* Tornato a funzionare (21/10): se l'indirizzo muore di nuovo nella stessa giornata, e' un
       guasto nuovo e merita la sua email. Prima restava "gia' segnalato" fino alla giornata dopo. */
    delete stato.abbonamentoScadutoSegnalato;
    /* L'invio di prima senza ricevuta, ora che il nuovo lo sostituisce (stesso topic), non
       arrivera' piu' (30/10). Prima veniva sovrascritto in silenzio: il 48h della G9 non si sa
       se sia mai arrivato. Solo se il sito ha appena risposto, altrimenti non lo sappiamo. */
    const prec = stato.ultimoInvio;
    if (prec && prec.fonte === 'sito' && !prec.confermato && !prec.esito && ricevuteLette) {
      segnaNonArrivato(stato, prec, 'prima del promemoria successivo');
    }
    stato.ultimoInvio = {
      id: ora.toISOString(), quando: ora.toISOString(), fonte,
      scade: new Date(ora.getTime() + opzioni.TTL * 1000).toISOString()
    };
  } catch (err) {
    if (ABBONAMENTO_DA_RIFARE.includes(err.statusCode)) {
      /* Prima questo caso finiva solo nel log e la soglia veniva segnata con l'orario, come se
         fosse partita: il telefono non riceveva nulla e da fuori non lo si poteva capire. Ora
         resta scritto nel file di stato e il workflow va in rosso UNA volta per giornata (il
         flag riparte da zero con la giornata nuova): un'email sola, non una per soglia. */
      segnaDovute('abbonamento-scaduto');
      /* A ogni giro, non solo al primo: se l'app nel frattempo ha scritto un indirizzo nuovo la
         funzione ignora la segnalazione sul vecchio (21/10). */
      const segnalato = fonte === 'sito' && await segnalaScaduto(SITO_URL, subscription.endpoint, err.statusCode);
      if (!stato.abbonamentoScadutoSegnalato) {
        stato.abbonamentoScadutoSegnalato = true;
        console.log(`::error::Promemoria non consegnato: il servizio push risponde ${err.statusCode} ` +
          '(indirizzo del telefono non piu valido). ' + rimedioScaduto(fonte, sito, perche, segnalato));
        process.exitCode = 1;
      } else {
        console.log(`Abbonamento ancora non valido (${err.statusCode}), gia segnalato per questa giornata.`);
      }
    } else if (eTransitorio(err)) {
      /* La soglia NON si segna: resta dovuta e si riprova al giro dopo. */
      stato.erroriInvio = (stato.erroriInvio || 0) + 1;
      const msg = `Promemoria ${daInviare.chiave} non spedito: servizio push non disponibile ` +
        `(${err.statusCode || err.message}), ${stato.erroriInvio} giri di fila.`;
      if (stato.erroriInvio >= TRANSITORI_PRIMA_DEL_ROSSO && !stato.erroriInvioSegnalati) {
        stato.erroriInvioSegnalati = true;
        console.log('::error::' + msg + ' Non passa da solo: guardare il log.');
        process.exitCode = 1;
      } else {
        console.log('::warning::' + msg + ' Riprovo al prossimo giro.');
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
