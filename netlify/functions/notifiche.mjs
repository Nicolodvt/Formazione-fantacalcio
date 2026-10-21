/* Le notifiche push senza copia-incolla, e con la prova che arrivano (16/10).

   Perche' esiste. Fino al 16/10 l'abbonamento push del telefono andava copiato a mano nel secret
   GitHub PUSH_SUBSCRIPTION, una volta sola (04/09). Da allora il servizio push ha accettato ogni
   invio, ma l'utente non ha mai visto una notifica: la Action spediva a un abbonamento che non
   era (piu') quello del telefono, e niente poteva accorgersene — un abbonamento di un altro
   dispositivo o di un'iscrizione vecchia viene accettato lo stesso. Qui due cose:
   - "abbonamento": l'app scrive da sola l'abbonamento attuale del telefono (a ogni apertura, se
     e' cambiato); la Action lo legge e lo usa al posto del secret, che resta solo come riserva.
   - "ricevuta": il service worker, appena mostra una notifica, scrive l'id del messaggio e
     l'esito. La Action confronta l'ultimo invio con l'ultima ricevuta: spedito ma mai arrivato
     diventa un giro rosso con la spiegazione, non piu' un silenzio.

   - "scaduto" (21/10): la Action ha avuto 404/410 dall'abbonamento letto qui. L'app, alla prima
     apertura, vede che il SUO indirizzo e' morto, se ne fa uno nuovo e lo riscrive: niente piu'
     "Disattiva e poi Attiva" a mano (che anzi uccideva l'indirizzo che la Action conosceva).
   - "disattivato" (21/10): l'utente ha spento i promemoria dall'app. La Action non spedisce e
     non ripiega sul secret, invece di andare in rosso ogni settimana su un indirizzo spento.

   Nessuna autenticazione, stessa scelta di schierato.mjs. Leggere l'abbonamento non permette di
   mandare notifiche (serve la chiave VAPID privata, che sta solo nei secret di GitHub); il
   peggio che puo' fare un estraneo che scrive qui e' farti perdere i promemoria finche' l'app
   non si riapre e lo riscrive. */

import { getStore } from '@netlify/blobs';

const COLLEZIONE = 'formazione-stato';
const CHIAVE = 'notifiche';

/* Solo la forma di un abbonamento Web Push, niente altro: l'endpoint e' sempre https. */
function abbonamentoValido(a) {
  return !!a && typeof a.endpoint === 'string' && /^https:\/\/[^\s]+$/.test(a.endpoint) &&
    a.endpoint.length < 1000 && !!a.keys && typeof a.keys.p256dh === 'string' &&
    typeof a.keys.auth === 'string' && a.keys.p256dh.length < 200 && a.keys.auth.length < 100;
}

export default async (req) => {
  const store = getStore(COLLEZIONE);
  const stato = (await store.get(CHIAVE, { type: 'json' })) || {};

  if (req.method === 'GET') {
    return risposta({
      abbonamento: stato.abbonamento || null,
      abbonamentoAggiornato: stato.abbonamentoAggiornato || null,
      ricevuta: stato.ricevuta || null,
      scaduto: stato.scaduto || null,
      disattivato: stato.disattivato || null
    });
  }

  if (req.method === 'POST') {
    let corpo;
    try { corpo = await req.json(); }
    catch { return risposta({ errore: 'JSON non valido' }, 400); }
    const { tipo } = corpo || {};

    if (tipo === 'abbonamento') {
      const a = corpo.abbonamento;
      if (!abbonamentoValido(a)) return risposta({ errore: 'abbonamento non valido' }, 400);
      stato.abbonamento = { endpoint: a.endpoint, keys: { p256dh: a.keys.p256dh, auth: a.keys.auth } };
      stato.abbonamentoAggiornato = new Date().toISOString();
      delete stato.scaduto;
      delete stato.disattivato;
    } else if (tipo === 'scaduto' || tipo === 'disattivato') {
      /* Vale solo per l'indirizzo registrato adesso: se nel frattempo l'app ne ha scritto uno
         nuovo, una segnalazione sul vecchio non deve toccarlo. */
      const e = corpo.endpoint;
      if (typeof e !== 'string' || e.length > 1000) return risposta({ errore: 'endpoint non valido' }, 400);
      if (!stato.abbonamento || stato.abbonamento.endpoint !== e) return risposta({ ok: true, ignorato: true });
      if (tipo === 'scaduto') {
        stato.scaduto = { endpoint: e, quando: new Date().toISOString(), codice: Number(corpo.codice) || null };
      } else {
        delete stato.abbonamento;
        delete stato.scaduto;
        stato.disattivato = new Date().toISOString();
      }
    } else if (tipo === 'ricevuta') {
      if (typeof corpo.id !== 'string' || corpo.id.length > 40) return risposta({ errore: 'id non valido' }, 400);
      stato.ricevuta = {
        id: corpo.id,
        quando: new Date().toISOString(),
        esito: String(corpo.esito || 'mostrata').slice(0, 200)
      };
    } else {
      return risposta({ errore: 'tipo sconosciuto' }, 400);
    }
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
