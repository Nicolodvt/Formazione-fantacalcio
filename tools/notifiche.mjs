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
export async function statoSito(sitoUrl) {
  if (!sitoUrl) return null;
  try {
    const r = await fetch(`${sitoUrl.replace(/\/$/, '')}/.netlify/functions/notifiche`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && typeof d === 'object' && 'abbonamento' in d ? d : null;
  } catch (e) { return null; }
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
   {sub, fonte: 'sito'|'secret', sito} oppure {sub: null, motivo}. */
export async function abbonamentoDaUsare(sitoUrl, secretRaw) {
  const sito = await statoSito(sitoUrl);
  if (sito && sito.abbonamento && sito.abbonamento.endpoint) {
    console.log(`Abbonamento dal sito (registrato dall'app il ${sito.abbonamentoAggiornato || '?'}): ${impronta(sito.abbonamento)}.`);
    return { sub: sito.abbonamento, fonte: 'sito', sito };
  }
  if (secretRaw) {
    let sub;
    try { sub = JSON.parse(secretRaw); }
    catch (e) { return { sub: null, sito, motivo: 'Il secret PUSH_SUBSCRIPTION non e un JSON valido.' }; }
    console.log((sito
      ? '::warning::Il sito non ha ancora l\'abbonamento del telefono (app non aggiornata o notifiche da riattivare): '
      : 'Sito non raggiungibile per l\'abbonamento: ') + `uso il secret PUSH_SUBSCRIPTION, ${impronta(sub)}.`);
    return { sub, fonte: 'secret', sito };
  }
  return { sub: null, sito, motivo: 'Nessun abbonamento: ne sul sito ne nel secret PUSH_SUBSCRIPTION.' };
}
