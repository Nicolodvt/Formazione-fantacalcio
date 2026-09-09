/* Ricorda una sola cosa, per una sola persona: "hai gia schierato la giornata N?".

   Perche' esiste. index.html (nel browser, offline-capable) e tools/promemoria-scadenza.mjs
   (nella GitHub Action, sempre online) girano su due macchine diverse e non si parlano
   direttamente — per scelta: niente credenziali nel browser, repository pubblico (vedi
   CLAUDE.md, "La decisione che regge tutto"). Questa funzione e' l'unico punto di contatto:
   il telefono scrive quando tocchi "Ho schierato", la Action legge prima di ogni promemoria
   e salta se e' gia stato fatto. E' la stessa idea di dati/promemoria.json (evitare di
   rispedire un avviso gia mandato), spostata su uno storage che il browser puo scrivere
   direttamente senza un token di GitHub in chiaro nel codice pubblico.

   Nessuna autenticazione: e' un'app per una sola persona, e il peggio che puo succedere se
   qualcun altro trova l'endpoint e lo tocca e' un promemoria in piu o in meno per te — non
   vale la complessita' di un login per questo rischio. Stessa scelta di "poche cose che si
   possono rompere in silenzio" gia seguita nel resto del progetto. */

import { getStore } from '@netlify/blobs';

const COLLEZIONE = 'formazione-stato';
const CHIAVE = 'schierato';

export default async (req) => {
  const store = getStore(COLLEZIONE);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const giornata = url.searchParams.get('giornata');
    if (!giornata) return risposta({ errore: 'manca il parametro giornata' }, 400);
    const stato = (await store.get(CHIAVE, { type: 'json' })) || {};
    return risposta({ giornata: Number(giornata), schierato: !!stato[giornata] });
  }

  if (req.method === 'POST') {
    let corpo;
    try { corpo = await req.json(); }
    catch { return risposta({ errore: 'JSON non valido' }, 400); }

    const { giornata, schierato } = corpo || {};
    if (giornata == null) return risposta({ errore: 'manca giornata' }, 400);

    const stato = (await store.get(CHIAVE, { type: 'json' })) || {};
    stato[String(giornata)] = !!schierato;
    /* Non serve tenere in giro le giornate vecchie: ne basta una manciata (poche settimane
       di margine) per evitare che l'oggetto cresca senza limite in 38 giornate di stagione. */
    const numeri = Object.keys(stato).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => b - a);
    const daTenere = new Set(numeri.slice(0, 6));
    Object.keys(stato).forEach(k => { if (!daTenere.has(Number(k))) delete stato[k]; });

    await store.setJSON(CHIAVE, stato);
    return risposta({ ok: true });
  }

  return risposta({ errore: 'metodo non supportato' }, 405);
};

function risposta(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
