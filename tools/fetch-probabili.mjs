/* Scarica le probabili formazioni di Serie A da fantacalcio.it e le riduce a un JSON
   che l'app sa leggere.

   PERCHE' QUESTO SCRIPT STA FUORI DALL'APP
   fantacalcio.it non manda header CORS: una pagina aperta nel browser non puo' chiamarlo.
   Questo gira in CI (GitHub Action), scrive dati/probabili.json dentro il repo, e l'app
   lo legge con un fetch same-origin. Cosi' nell'app non finiscono ne' credenziali ne'
   dipendenze di rete: se questo script muore, l'app continua con l'ultimo file buono.

   PERCHE' NIENTE LIBRERIE
   Nessun cheerio, nessun jsdom: solo regex su HTML servito dal server. E' una scelta
   consapevole con un prezzo — se cambiano il markup, si rompe. Per questo ogni estrazione
   passa da controlli che FALLISCONO RUMOROSAMENTE (vedi validare()). Un JSON mezzo vuoto
   scritto in silenzio sarebbe molto peggio di un workflow rosso: l'app mostrerebbe una
   formazione sbagliata senza che nessuno se ne accorga.

   AGGANCIO CON L'APP ASTA
   Gli id nelle URL di fantacalcio.it sono gli stessi id del listone (Malen 5585,
   Svilar 5841). L'aggancio e' per chiave esatta, mai per nome: "Martinez L." contro
   "Lautaro Martinez" sarebbe una sorgente infinita di errori silenziosi. */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const USCITA = resolve(QUI, '..', 'dati', 'probabili.json');
const URL_PAGINA = 'https://www.fantacalcio.it/probabili-formazioni-serie-a';
const SCHEMA = 1;

/* Ci si presenta per quello che si e'. Poche richieste a settimana, nessuna insistenza. */
const UA = 'FantaFormazione/1.0 (app personale, lega da 8 squadre)';

const RUOLI = { p: 'P', d: 'D', c: 'C', a: 'A' };

/* ---------- utilita' di parsing ---------- */

function entita(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
const pulisci = (s) => entita(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/* Taglia il documento nei blocchi che iniziano con `marcatore`. Il pezzo prima del primo
   marcatore non e' un blocco e viene scartato. */
const blocchi = (html, marcatore) => html.split(marcatore).slice(1);

const idDaLink = (s) => {
  const m = /\/serie-a\/squadre\/[^/"']+\/[^/"']+\/(\d+)/.exec(s);
  return m ? +m[1] : null;
};
const nomeDaLink = (s) => {
  const m = /class="player-name player-link"[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(s);
  return m ? pulisci(m[1]) : null;
};

/* Un <li class="player-item pill"> -> oggetto giocatore. */
function leggiGiocatore(li, squadra, titolare) {
  const id = idDaLink(li);
  if (!id) return null;
  const ruolo = /class="role"\s+data-value="([pdca])"/.exec(li);
  const pct = /aria-valuenow="(\d+)"/.exec(li) || /--value:\s*(\d+)/.exec(li);
  const stato = /data-status="([^"]*)"/.exec(li);
  return {
    id,
    nome: nomeDaLink(li),
    squadra,
    ruolo: ruolo ? RUOLI[ruolo[1]] : null,
    /* La percentuale e' quella dichiarata dalla redazione. Assente non vuol dire zero:
       resta null e decide l'app. */
    pct: pct ? +pct[1] : null,
    titolare,
    /* data-status diverso da "success" e' il segnale che la redazione stessa non e'
       convinta: e' un dubbio dichiarato dalla fonte, non una nostra inferenza. */
    incerto: stato ? stato[1] !== 'success' : false
  };
}

/* Le liste "Squalificati", "Infortunati", "In dubbio": nome + descrizione libera. */
function leggiIndisponibili(sezione, tipo, dentro) {
  if (!sezione) return;
  for (const li of blocchi(sezione, '<li>')) {
    const id = idDaLink(li);
    if (!id) continue;
    const desc = /class="description">([\s\S]*?)<\/p>/.exec(li);
    /* Un giocatore puo' comparire in piu' liste. Vince la prima, e l'ordine di chiamata
       mette per primo il caso piu' grave: uno squalificato non gioca, punto, e
       segnalarlo come "in dubbio" sarebbe fuorviante. */
    if (!dentro[id]) dentro[id] = { id, tipo, nota: desc ? pulisci(desc[1]) : null };
  }
}

/* ---------- estrazione ---------- */

function estrai(html) {
  const giornata = /class="matchweek"[^>]*>\s*(\d+)\s*</.exec(html);

  const squadre = {};
  const giocatori = {};
  const indisponibili = {};
  const ballottaggi = [];
  const partite = [];

  for (const m of blocchi(html, '<li class="match match-item')) {
    const hash = /data-match-hash="([^"]*)"/.exec(m);
    /* Attenzione: di "match-date" ce ne sono DUE per partita. Il primo, nell intestazione,
       e un segnaposto mai compilato (porta startDate="1970-01-01" e mostra 01/01 01:00) e
       una volta e finito davvero nell app. Quello buono sta dentro match-info: va cercato
       li dentro, o si legge un orario inventato. */
    const data = /class="match-info">[\s\S]*?class="match-date">([\s\S]*?)<\/div>/.exec(m);
    const stadio = /class="match-stadium">([\s\S]*?)<\/div>/.exec(m);
    const quando = data ? pulisci(data[1]) : null;
    const dove = stadio ? pulisci(stadio[1]) : null;

    /* Le due carte squadra della partita, nell'ordine in cui compaiono: casa poi ospite. */
    const nomi = [];
    const carte = blocchi(m, '<div class="card team-card');

    for (let i = 0; i < carte.length; i++) {
      const c = carte[i];
      const nome = /class="h6 team-name">([\s\S]*?)<\/h3>/.exec(c);
      if (!nome) continue;
      const squadra = pulisci(nome[1]);
      nomi.push(squadra);

      const modulo = /class="h6 team-formation">([\s\S]*?)<\/div>/.exec(c);
      squadre[squadra] = {
        modulo: modulo ? pulisci(modulo[1]) : null,
        inCasa: i === 0,
        avversario: null,          // riempito sotto, quando si conoscono entrambe
        data: quando,
        stadio: dove
      };

      /* Titolari e riserve sono due <ul> distinti dentro la stessa carta. */
      const tit = /class="player-list starters">([\s\S]*?)<\/ul>/.exec(c);
      const ris = /class="player-list reserves">([\s\S]*?)<\/ul>/.exec(c);
      for (const [lista, titolare] of [[tit, true], [ris, false]]) {
        if (!lista) continue;
        for (const li of blocchi(lista[1], '<li class="player-item')) {
          const g = leggiGiocatore(li, squadra, titolare);
          if (g) giocatori[g.id] = g;
        }
      }
    }

    if (nomi.length === 2) {
      squadre[nomi[0]].avversario = nomi[1];
      squadre[nomi[1]].avversario = nomi[0];
      partite.push({
        casa: nomi[0], trasferta: nomi[1],
        data: quando, stadio: dove,
        hash: hash ? hash[1] : null
      });
    }

    for (const [cls, tipo] of [['suspendeds', 'squalificato'], ['injureds', 'infortunato'], ['dubts', 'dubbio']]) {
      const sez = new RegExp('<section class="' + cls + '">([\\s\\S]*?)</section>').exec(m);
      leggiIndisponibili(sez && sez[1], tipo, indisponibili);
    }

    /* Ballottaggi: due o piu' nomi che si giocano lo stesso posto, con le percentuali. */
    const sezB = /<section class="ballots">([\s\S]*?)<\/section>/.exec(m);
    if (sezB) {
      for (const b of blocchi(sezB[1], '<ul class="ballot-list">')) {
        const inGara = [];
        for (const li of blocchi(b.split('</ul>')[0], '<li class="dot')) {
          const id = idDaLink(li);
          if (!id) continue;
          const p = /class="percentage">\s*(\d+)/.exec(li);
          inGara.push({ id, nome: nomeDaLink(li), pct: p ? +p[1] : null });
        }
        if (inGara.length >= 2) ballottaggi.push(inGara);
      }
    }
  }

  return {
    schema: SCHEMA,
    generato: new Date().toISOString(),
    fonte: URL_PAGINA,
    giornata: giornata ? +giornata[1] : null,
    partite, squadre, giocatori, ballottaggi, indisponibili
  };
}

/* ---------- validazione ----------
   Meglio un workflow rosso che un JSON plausibile ma sbagliato: l'app si fida di questo
   file, e un dato mancante qui diventa una formazione sbagliata la domenica. */
function validare(d) {
  const problemi = [];
  const gioc = Object.values(d.giocatori);
  const nSquadre = Object.keys(d.squadre).length;

  if (d.giornata == null) problemi.push('giornata non trovata');
  if (nSquadre !== 20) problemi.push(`squadre trovate: ${nSquadre}, attese 20`);
  if (d.partite.length !== 10) problemi.push(`partite trovate: ${d.partite.length}, attese 10`);
  if (gioc.length < 400) problemi.push(`giocatori trovati: ${gioc.length}, attesi almeno 400`);

  /* Il segnaposto e gia passato una volta: se ricapita deve fermare tutto qui, non
     arrivare fino allo schermo travestito da orario vero. */
  const dateFinte = d.partite.filter(p => !p.data || /^01\/01/.test(p.data)).length;
  if (dateFinte) problemi.push(`${dateFinte} partite con data segnaposto o mancante`);
  const senzaStadio = d.partite.filter(p => !p.stadio || p.stadio === '-').length;
  if (senzaStadio) problemi.push(`${senzaStadio} partite senza stadio`);

  const senzaRuolo = gioc.filter(g => !g.ruolo).length;
  if (senzaRuolo) problemi.push(`${senzaRuolo} giocatori senza ruolo`);
  const senzaNome = gioc.filter(g => !g.nome).length;
  if (senzaNome) problemi.push(`${senzaNome} giocatori senza nome`);

  for (const [sq, info] of Object.entries(d.squadre)) {
    const titolari = gioc.filter(g => g.squadra === sq && g.titolare).length;
    if (titolari !== 11) problemi.push(`${sq}: ${titolari} titolari invece di 11`);
    if (!info.modulo) problemi.push(`${sq}: modulo mancante`);
    if (!info.avversario) problemi.push(`${sq}: avversario mancante`);
  }
  return problemi;
}

/* ---------- esecuzione ---------- */

async function main() {
  const soloProva = process.argv.includes('--prova');

  const r = await fetch(URL_PAGINA, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${URL_PAGINA}`);
  const html = await r.text();

  const dati = estrai(html);
  const problemi = validare(dati);

  console.log(`Giornata ${dati.giornata} — ${Object.keys(dati.squadre).length} squadre, ` +
    `${Object.keys(dati.giocatori).length} giocatori, ${dati.ballottaggi.length} ballottaggi, ` +
    `${Object.keys(dati.indisponibili).length} indisponibili`);

  if (problemi.length) {
    console.error('\nVALIDAZIONE FALLITA:');
    problemi.forEach(p => console.error('  - ' + p));
    console.error('\nIl file NON e stato scritto: meglio tenere quello vecchio che scriverne uno rotto.');
    process.exit(1);
  }

  if (soloProva) { console.log('\n--prova: validazione superata, niente scritto.'); return; }

  await mkdir(dirname(USCITA), { recursive: true });
  await writeFile(USCITA, JSON.stringify(dati, null, 1) + '\n', 'utf8');
  console.log('Scritto ' + USCITA);
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
