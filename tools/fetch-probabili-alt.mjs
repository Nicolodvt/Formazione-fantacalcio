/* Seconda fonte per le probabili formazioni, di RISERVA — gira solo se fetch-probabili.mjs
   (la fonte principale, fantacalcio.it) fallisce. Non sostituisce quella, la affianca: due
   fonti indipendenti valgono piu' di una, ma una sola alla volta scrive dati/probabili.json.

   FONTE: fantacalcio-online.com, un aggregatore che mette affiancate le previsioni di quattro
   redazioni (Fantacalcio.it, Gazzetta, SOS Fanta, Sky) con una percentuale media. Verificato a
   mano (09/09/2026): markup pulito con classi semantiche (prb-tabella, prb-nome, prb-cella--*),
   robots.txt che permette esplicitamente `User-agent: * / Allow: /` a un crawler dichiarato
   come il nostro. Stesso stile di parsing di fetch-probabili.mjs: solo regex, zero dipendenze,
   fallisce rumorosamente invece di scrivere un JSON mezzo vuoto in silenzio.

   IL PROBLEMA VERO: NIENTE ID IN COMUNE
   fantacalcio-online.com non e' fantacalcio.it: non condivide gli id numerici su cui si regge
   tutto l'aggancio rosa<->dati (vedi CLAUDE.md, "L'aggancio: id di fantacalcio.it"). Qui,
   PER FORZA, si abbina per nome — la fragilita' che il progetto evita apposta ovunque altrove.
   Mitigazione, minima ma reale: l'abbinamento e' SEMPRE scoped alla squadra (la pagina dice
   "questo giocatore gioca per la Fiorentina", si cerca solo fra i giocatori della Fiorentina
   nel listone, mai in tutto il listone), per cognome normalizzato. Se il cognome non e'
   univoco nemmeno dentro la squadra, o non trova nessuno, il giocatore viene SALTATO e
   segnalato in console — mai indovinato. E' una fonte di riserva peggiore di quella
   principale per questo motivo dichiarato, non un sostituto alla pari. */

import { writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const USCITA = resolve(QUI, '..', 'dati', 'probabili.json');
const INDEX_HTML = resolve(QUI, '..', 'index.html');
const URL_PAGINA = 'https://www.fantacalcio-online.com/it/serie-a/2026-2027/probabili-formazioni/ultima-giornata';
const SCHEMA = 1;
const UA = 'FantaFormazione/1.0 (app personale, lega da 8 squadre; fonte di riserva)';

function entita(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
const pulisci = (s) => entita(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/* Stesso normalizzatore usato per abbinare a mano la rosa di questa sessione: minuscolo,
   senza accenti, solo lettere/numeri/spazi. */
function normalizza(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}

async function caricaListonePerSquadra() {
  const html = await readFile(INDEX_HTML, 'utf8');
  const m = /<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('listone-data non trovato in index.html');
  const listone = JSON.parse(m[1]);
  const perSquadra = {};
  listone.forEach(p => {
    (perSquadra[p.s] ||= []).push(p);
  });
  return perSquadra;
}

/* Un cognome -> id nel listone, scoped alla squadra. I due siti scrivono i nomi composti in
   modo diverso ("Nuno Tavares" qui, solo "Tavares" nel listone; "Anguissa" qui, "Zambo
   Anguissa" nel listone; "Del Prato" con spazio contro "Delprato" senza) — tre tentativi via
   via piu' larghi, ma OGNUNO deve trovare esattamente un candidato per contare: se anche il
   tentativo piu' permissivo trova piu' di un giocatore (come i due Martinez dell'Inter),
   niente vince e il giocatore resta non agganciato. Mai indovinare fra piu' di uno. */
function trovaId(perSquadra, squadra, cognome) {
  const candidati = perSquadra[squadra];
  if (!candidati) return null;
  const target = normalizza(cognome);
  const targetSenzaSpazi = target.replace(/ /g, '');
  const ultimaParola = target.split(' ').pop();

  const unico = (lista) => (lista.length === 1 ? lista[0].id : null);

  let trovati = candidati.filter(p => {
    const n = normalizza(p.n);
    return n === target || n.replace(/ /g, '') === targetSenzaSpazi;
  });
  if (trovati.length) return unico(trovati);

  trovati = candidati.filter(p => {
    const n = normalizza(p.n);
    return n.startsWith(target + ' ') || target.startsWith(n + ' ');
  });
  if (trovati.length) return unico(trovati);

  trovati = candidati.filter(p => normalizza(p.n).split(' ').pop() === ultimaParola);
  if (trovati.length) return unico(trovati);

  /* Il listone disambigua gli omonimi come "Tavares N." o "Diallo O." — cognome vero PRIMA,
     iniziale del nome dopo. "Nuno Tavares" (qui) o "Diallo Thiao" (doppio cognome) non hanno
     nessuna parola in comune con "n"/"o" (l'iniziale), ma la CONFRONTANDO la prima parola del
     listone (il cognome vero) contro tutte le parole del nome trovato qui si aggancia. */
  const primaParolaListone = (p) => normalizza(p.n).split(' ')[0];
  trovati = candidati.filter(p => target.split(' ').includes(primaParolaListone(p)));
  return unico(trovati);
}

/* "11/09/2026 20:45" -> "giovedì 11 settembre, 20:45", lo stesso formato che calendario.mjs
   (parseData) e index.html (parseDataPartita) sanno gia leggere: un solo formato di data in
   tutto il progetto, non uno nuovo da insegnare a chi lo consuma. */
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function formattaData(ddmmyyyyHHmm) {
  const m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(ddmmyyyyHHmm);
  if (!m) return null;
  const [, gg, mm, aaaa, HH, MM] = m;
  const d = new Date(+aaaa, +mm - 1, +gg, +HH, +MM);
  return `${GIORNI[d.getDay()]} ${gg} ${MESI[+mm - 1]}, ${HH}:${MM}`;
}

function estraiRuolo(blocco) {
  const m = /class='role role-(\w)'/.exec(blocco);
  return m ? { p: 'P', d: 'D', c: 'C', a: 'A' }[m[1]] : null;
}
function estraiCognome(blocco) {
  const m = /class="prb-nome">([^<]+)<small>/.exec(blocco);
  return m ? pulisci(m[1]) : null;
}

/* Percentuale e stato dalla colonna Media* (l'ultima cella prb-cella prima di quella di
   conferma ufficiale): e' il numero su cui questa fonte fa gia la sintesi di 4 redazioni,
   non serve rifarla qui. */
function estraiMedia(rigaHtml) {
  const m = /<td class="prb-cella prb-cella--(\w+) prb-cella--media">[\s\S]*?>(\d+)%</.exec(rigaHtml);
  if (!m) return null;
  return { stato: m[1], pct: +m[2] };
}

async function scaricaPagina() {
  const r = await fetch(URL_PAGINA, { headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${URL_PAGINA}`);
  return r.text();
}

function estraiPartite(html) {
  return html.split('<header class="prb-incontro">').slice(1);
}

function estraiSquadre(bloccoPartita) {
  /* prb-squadra--home e prb-squadra--away, in quest'ordine nella pagina: non ci si affida
     all'ordine, si legge la classe per sapere chi gioca in casa. */
  return bloccoPartita.split('<section class="prb-squadra').slice(1).map(b => 'class="prb-squadra' + b);
}

async function main() {
  const perSquadra = await caricaListonePerSquadra();
  const html = await scaricaPagina();

  const partiteHtml = estraiPartite(html);
  if (!partiteHtml.length) throw new Error('nessuna partita trovata: la pagina e cambiata o e vuota');

  const giocatori = {};
  const indisponibili = {};
  const squadre = {};
  const partite = [];
  let saltati = 0;

  partiteHtml.forEach(bp => {
    const dataM = /prb-incontro__data">([^<]+)</.exec(bp);
    const dataFormattata = dataM ? formattaData(dataM[1]) : null;

    /* ATTENZIONE alla trappola: "prb-incontro__lato--ospite" CONTIENE la sottostringa
       "prb-incontro__lato" come prefisso, quindi uno split ingenuo su quel marcatore trova
       TRE pezzi per un solo lato in casa/trasferta (il secondo e' solo "--ospite\">...", un
       frammento vuoto), non due. Si cercano i due lati per marcatore ESATTO invece di splittare
       alla cieca — scoperto qui provando lo script sui dati veri, non a tavolino. */
    const iCasa = bp.indexOf('prb-incontro__lato">');
    const iOspite = bp.indexOf('prb-incontro__lato--ospite">');
    if (iCasa === -1 || iOspite === -1) return;
    const bloccoCasa = bp.slice(iCasa, iOspite);
    const bloccoOspite = bp.slice(iOspite);
    const nomeCasa = pulisci((/prb-incontro__nome">([^<]+)</.exec(bloccoCasa) || [])[1] || '');
    const nomeOspite = pulisci((/prb-incontro__nome">([^<]+)</.exec(bloccoOspite) || [])[1] || '');
    if (!nomeCasa || !nomeOspite || !dataFormattata) return;

    partite.push({ casa: nomeCasa, trasferta: nomeOspite, data: dataFormattata, stadio: '', hash: '' });
    squadre[nomeCasa] = { avversario: nomeOspite, inCasa: true, data: dataFormattata, modulo: null };
    squadre[nomeOspite] = { avversario: nomeCasa, inCasa: false, data: dataFormattata, modulo: null };

    estraiSquadre(bp).forEach(bs => {
      const squadraM = /prb-squadra__nome">([^<]+)</.exec(bs);
      const squadra = squadraM ? pulisci(squadraM[1]) : null;
      if (!squadra) return;

      /* Titolari: solo dentro la tabella, non dentro la lista indisponibili che segue. */
      const finTabella = bs.indexOf('</table>');
      const bloccoTitolari = finTabella === -1 ? bs : bs.slice(0, finTabella);
      bloccoTitolari.split('<tr>').slice(1).forEach(riga => {
        const ruolo = estraiRuolo(riga);
        const cognome = estraiCognome(riga);
        const media = estraiMedia(riga);
        if (!ruolo || !cognome || !media) return;
        const id = trovaId(perSquadra, squadra, cognome);
        if (id == null) { saltati++; console.error(`  non agganciato: ${cognome} (${squadra})`); return; }
        giocatori[id] = {
          pct: media.pct,
          titolare: media.stato === 'certo' || media.stato === 'probabile',
          incerto: media.stato === 'dubbio'
        };
      });

      /* Indisponibili: dopo la tabella, blocco prb-fuori. */
      const bloccoFuori = finTabella === -1 ? '' : bs.slice(finTabella);
      bloccoFuori.split('<li class="prb-fuori__riga">').slice(1).forEach(riga => {
        const ruolo = estraiRuolo(riga);
        const cognome = estraiCognome(riga);
        const etichettaM = /fco-etichetta--\w+">([^<]+)</.exec(riga);
        if (!ruolo || !cognome || !etichettaM) return;
        const id = trovaId(perSquadra, squadra, cognome);
        if (id == null) { saltati++; console.error(`  non agganciato (indisponibile): ${cognome} (${squadra})`); return; }
        const testo = pulisci(etichettaM[1]).toLowerCase();
        const tipo = testo.includes('squalific') ? 'squalificato'
          : testo.includes('infortun') ? 'infortunato' : 'dubbio';
        indisponibili[id] = { tipo, dettaglio: pulisci(etichettaM[1]) };
      });
    });
  });

  const nGiocatori = Object.keys(giocatori).length;
  /* Stessa soglia di sicurezza della fonte principale: una pagina che ne trova pochissimi
     e' quasi certamente una pagina cambiata sotto i piedi, non un turno con poche notizie. */
  if (nGiocatori < 100) {
    throw new Error(`solo ${nGiocatori} giocatori agganciati (soglia minima 100): probabile cambio di markup, non scrivo nulla`);
  }

  /* Il numero di giornata non e' scritto in chiaro da nessuna parte nella pagina, ma trapela
     dai link "/voti/N-giornata/..." sparsi nell'HTML (link ad altre pagine del sito) — lo
     stesso numero per tutti, verificato prendendo il piu' frequente invece del primo trovato,
     nel caso isolato compaia un link a una giornata diversa (es. "giornata precedente"). */
  const numeriGiornata = {};
  for (const m of html.matchAll(/\/voti\/(\d+)-giornata\//g)) numeriGiornata[m[1]] = (numeriGiornata[m[1]] || 0) + 1;
  const giornata = Object.keys(numeriGiornata).length
    ? +Object.entries(numeriGiornata).sort((a, b) => b[1] - a[1])[0][0]
    : null;
  if (giornata == null) throw new Error('numero di giornata non trovato nella pagina: non scrivo nulla');

  const out = {
    schema: SCHEMA,
    generato: new Date().toISOString(),
    giornata,
    fonte: URL_PAGINA,
    fonteDiRiserva: true,
    squadre,
    giocatori,
    indisponibili,
    partite
  };

  console.log(`Fonte di riserva: giornata ${giornata}, ${nGiocatori} giocatori, ${partite.length} partite, ${saltati} righe saltate (nome non agganciato).`);
  if (process.argv.includes('--prova')) { console.log('--prova: validazione superata, niente scritto.'); return; }
  await writeFile(USCITA, JSON.stringify(out, null, 1) + '\n');
}

main().catch(err => { console.error('Fonte di riserva fallita:', err.message); process.exitCode = 1; });
