/* Pezzi comuni ai due script che mandano notifiche push (invia-promemoria.mjs e
   promemoria-scadenza.mjs): da dove prendere l'abbonamento, come spedire, come sapere se e'
   arrivato. Nessuna dipendenza: web-push lo importano gli script, solo quando serve.

   DA DOVE VIENE L'ABBONAMENTO (16/10). Fino ad allora solo dal secret PUSH_SUBSCRIPTION, copiato
   a mano dall'app il 04/09: per settimane il servizio push ha accettato ogni invio e sul telefono
   non e' arrivato niente, senza un modo di accorgersene. Ora l'app lo scrive da sola sul sito
   (netlify/functions/notifiche.mjs) e qui si usa quello; il secret resta come riserva, finche'
   l'app nuova non e' pubblicata o se il sito non risponde. */

/* Stessa chiave pubblica di index.html e sw.js (VAPID_PUBLIC_KEY). Non e' un segreto. Se un
   giorno si rigenera la coppia, va cambiata in TUTTI i posti insieme. */
export const VAPID_PUBLIC_KEY = 'BHWwgaSHRz5TzxveQbvlZ6Cx__SgARqi_-hEXlD1g6Av-gYH_Y8cq48pY6-Zb2bcLlLNgDWwdFrDGn5M00ICRjM';

/* Risposte del servizio push che vogliono dire "questo abbonamento non funziona piu', riprovare
   non serve": 404/410 scaduto o revocato, 401/403 chiavi VAPID che non corrispondono. */
export const ABBONAMENTO_DA_RIFARE = [401, 403, 404, 410];

/* Intoppi che passano da soli (16/10): rete, 5xx, 429. */
export const eTransitorio = (err) => !err.statusCode || err.statusCode >= 500 || err.statusCode === 429;

export async function inviaConRiprova(webpush, sub, payload) {
  try { return await webpush.sendNotification(sub, payload); }
  catch (err) {
    if (!eTransitorio(err)) throw err;
    console.log(`Servizio push non disponibile (${err.statusCode || err.message}): riprovo fra poco.`);
    await new Promise(r => setTimeout(r, +(process.env.ATTESA_RIPROVA_MS ?? 5000)));
    return await webpush.sendNotification(sub, payload);
  }
}

/* Quello che il sito sa delle notifiche: {abbonamento, abbonamentoAggiornato, ricevuta}, o null
   se non risponde (sito non configurato, funzione non ancora pubblicata, rete). */
/* Perche' l'ultima lettura non e' andata (21/10): il 20/10 i due giri rossi per un 410 hanno usato
   il secret perche' il sito non aveva dato l'abbonamento, e il motivo non stava da nessuna parte
   (i log completi si leggono solo da loggati, le annotazioni no). Ora finisce nell'avviso. */
let motivoSito = '';
export async function statoSito(sitoUrl) {
  motivoSito = '';
  if (!sitoUrl) { motivoSito = 'NETLIFY_SITE_URL non impostato'; return null; }
  let r;
  try {
    r = await fetch(`${sitoUrl.replace(/\/$/, '')}/.netlify/functions/notifiche`,
      { signal: AbortSignal.timeout(8000) });
  } catch (e) { motivoSito = `sito non raggiungibile (${e.message})`; return null; }
  if (!r.ok) {
    motivoSito = `la funzione "notifiche" risponde ${r.status}` +
      (r.status === 404 ? ', cioe\' non e\' online: controllare l\'ultimo deploy su Netlify' : '');
    return null;
  }
  let d;
  try { d = await r.json(); }
  /* "JSON" no, nel testo: gli script riconoscono il secret rotto da quella parola nel motivo. */
  catch (e) { motivoSito = 'la funzione "notifiche" risponde con una pagina, non con i dati (non e\' online?)'; return null; }
  if (d && typeof d === 'object' && 'abbonamento' in d) return d;
  motivoSito = 'la funzione "notifiche" risponde senza il campo "abbonamento"';
  return null;
}

/* Impronta corta dell'endpoint, per il log: abbastanza per riconoscere "e' cambiato", niente
   che serva a qualcuno. */
export function impronta(sub) {
  const e = String(sub && sub.endpoint || '');
  let h = 0;
  for (let i = 0; i < e.length; i++) h = (h * 31 + e.charCodeAt(i)) >>> 0;
  const servizio = (/^https:\/\/([^/]+)/.exec(e) || [])[1] || '?';
  return `${servizio} #${h.toString(16).padStart(8, '0')}`;
}

/* L'abbonamento da usare: prima quello del sito, poi il secret. Restituisce
   {sub, fonte: 'sito'|'secret', sito, perche} oppure {sub: null, motivo}. "perche": con il
   secret, perche' non si e' usato il sito (va nei messaggi d'errore degli script). */
export async function abbonamentoDaUsare(sitoUrl, secretRaw) {
  const sito = await statoSito(sitoUrl);
  if (sito && sito.abbonamento && sito.abbonamento.endpoint) {
    console.log(`Abbonamento dal sito (registrato dall'app il ${sito.abbonamentoAggiornato || '?'}): ${impronta(sito.abbonamento)}.`);
    return { sub: sito.abbonamento, fonte: 'sito', sito };
  }
  const perche = sito
    ? 'il sito non ha ancora l\'abbonamento del telefono (app non aggiornata o notifiche da riattivare)'
    : 'abbonamento non letto dal sito: ' + motivoSito;
  if (secretRaw) {
    let sub;
    try { sub = JSON.parse(secretRaw); }
    catch (e) { return { sub: null, sito, motivo: 'Il secret PUSH_SUBSCRIPTION non e un JSON valido.' }; }
    /* Sempre un avviso (21/10): prima, con il sito che non rispondeva, era una riga del log
       invisibile dalle annotazioni. */
    console.log(`::warning::${perche[0].toUpperCase() + perche.slice(1)}. Uso il secret PUSH_SUBSCRIPTION, ${impronta(sub)}.`);
    return { sub, fonte: 'secret', sito, perche };
  }
  return { sub: null, sito, motivo: `Nessun abbonamento nel secret PUSH_SUBSCRIPTION, e ${perche}.` };
}
