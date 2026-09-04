/* Scarica i voti di una giornata gia giocata da fantacalcio.it.

   A COSA SERVE
   Chiude il ciclo settimanale: l'app sa chi hai schierato, e con questi voti calcola da sola
   quanto hai fatto, senza che tu debba copiare nulla a mano. Nel tempo diventa anche la base
   per sostituire le medie voto STIMATE dalle quotazioni con quelle MISURATE sul campo, che e
   il limite dichiarato numero uno del modello.

   NON SERVE NESSUN LOGIN. La pagina dei voti e pubblica e servita dal server, come quella
   delle probabili. L'endpoint /api/v1/Excel/votes/... risponde 401 e non viene usato.

   QUALE VOTO
   Il sito pubblica TRE voti per giocatore, in tre "pill" affiancate e nello stesso ordine per
   tutti: Redazione Fantacalcio, Voto Statistico, Voto Italia. La nostra lega usa gli UFFICIALI
   Fantacalcio.it, cioe la PRIMA. Prendere la colonna sbagliata non darebbe errore: darebbe uno
   storico interamente falso, che e molto peggio. Per questo l'ordine delle tre fonti viene
   verificato leggendo le icone di intestazione, e se non torna lo script si ferma.

   USO
     node tools/fetch-voti.mjs 2          scarica la giornata 2 e scrive dati/voti-2.json
     node tools/fetch-voti.mjs 2 --prova  valida soltanto, senza scrivere
*/

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const DIR_DATI = resolve(QUI, '..', 'dati');
const STAGIONE = '2026-27';
const SCHEMA = 1;
const UA = 'FantaFormazione/1.0 (app personale, lega da 8 squadre)';

const RUOLI = { p: 'P', d: 'D', c: 'C', a: 'A' };

/* Ordine atteso delle tre colonne di voto. Se il sito lo cambia, meglio fermarsi. */
const FONTI_ATTESE = ['Redazione Fantacalcio', 'Voto Statistico', 'Voto Italia'];

/* I bonus/malus, nell'ordine in cui compaiono. Si aggancia al `title`, non alla posizione:
   se un giorno ne aggiungono uno in mezzo, i valori restano appaiati alla cosa giusta. */
const BONUS = {
  'Gol segnati': 'gol',
  'Gol subiti': 'golSubiti',
  'Autoreti': 'autogol',
  'Rigori segnati': 'rigoriSegnati',
  'Rigori sbagliati': 'rigoriSbagliati',
  'Rigori parati': 'rigoriParati',
  'Assist': 'assist',
  'Player of the match': 'migliorInCampo'
};

/* ---------- parsing ---------- */

function entita(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
const pulisci = (s) => entita(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const blocchi = (html, marcatore) => html.split(marcatore).slice(1);

/* Il sito marca "senza voto" con la sentinella 55, non con una casella vuota.
   Verificato sulla giornata 1: il valore 55 compare 75 volte (25 giocatori x 3 fonti) e
   TUTTE le 28 righe che lo contengono portano l'icona "Subentrato" — sono entrati troppo
   tardi per essere giudicati. I voti veri stanno fra 4 e 9 e usano la virgola ("5,5"), quindi
   55 non e ambiguo. Preso per buono darebbe una media di giornata intorno a 10, cioe uno
   storico senza alcun senso. */
const SENZA_VOTO = 55;

/* I numeri usano la virgola decimale: "6,5" -> 6.5. */
function numero(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* La sentinella vale SOLO per i voti. Tenerla dentro il parser generico era un difetto
   latente: lo stesso parser legge anche i bonus, e un giorno un bonus di 55 (impossibile
   oggi, ma la garanzia e solo che nel calcio non capita) sarebbe diventato zero in silenzio. */
function numeroVoto(s) {
  const n = numero(s);
  return n === SENZA_VOTO ? null : n;
}

/* Controlla che le tre colonne siano ancora quelle che crediamo, leggendo i title delle icone
   di intestazione. Si guardano TUTTE le venti tabelle, non solo la prima: la versione
   precedente leggeva le prime tre icone del documento, cioe verificava l'Atalanta e dava per
   buone le altre diciannove.

   Ogni tabella porta quattro icone — le tre colonne piu una ripetizione — quindi si prendono
   le prime tre di ciascuna.

   LIMITE DICHIARATO: questo protegge dal caso in cui il sito riordini le colonne insieme alle
   intestazioni. NON puo proteggere dal caso in cui riordini le celle lasciando le intestazioni
   dove sono, perche ogni colonna e internamente coerente (il suo fantavoto quadra con il suo
   voto) e non esiste nulla nel contenuto che dica quale sia quale. E il residuo di rischio
   accettato scegliendo di leggere per posizione. */
function verificaOrdineFonti(html) {
  const tabelle = html.split('<table class="grades-table').slice(1);
  if (!tabelle.length) return { ok: false, visto: '(nessuna tabella dei voti trovata)' };

  const viste = [];
  for (const t of tabelle) {
    const corpo = t.split('</table>')[0];
    const tit = [...corpo.matchAll(/ico-(?:fc|stats|italy)\.svg"[^>]*title="([^"]+)"/g)]
      .map(m => m[1]).slice(0, 3);
    viste.push(tit.join(' | '));
  }
  const atteso = FONTI_ATTESE.join(' | ');
  const diverse = [...new Set(viste.filter(x => x !== atteso))];
  return {
    ok: diverse.length === 0,
    visto: diverse.length ? diverse.join('  /  ') + ` (in ${viste.filter(x => x !== atteso).length} tabelle su ${viste.length})` : atteso
  };
}

function estrai(html, giornata) {
  const giocatori = {};
  const squadre = [];

  for (const t of blocchi(html, '<table class="grades-table')) {
    const corpo = t.split('</table>')[0];
    /* Ancorato a itemprop="name": dentro lo stesso <a> ci sono DUE meta, "name" e "url", e
       senza l'ancoraggio bastava che ne invertissero l'ordine per ritrovarsi l'URL al posto
       del nome della squadra, per tutti i giocatori, senza nessun errore. */
    const nomeSquadra = /class="team-name team-link[^"]*"[\s\S]*?itemprop="name" content="([^"]+)"/.exec(corpo);
    const squadra = nomeSquadra ? pulisci(nomeSquadra[1]) : null;
    if (squadra) squadre.push(squadra);

    for (const riga of blocchi(corpo, '<tr>')) {
      const link = /\/serie-a\/squadre\/[^/"']+\/[^/"']+\/(\d+)/.exec(riga);
      if (!link) continue;
      const nome = /class="player-name player-link"[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(riga);
      const ruolo = /class="role" data-value="([pdca])"/.exec(riga);

      /* L'ammonizione non sta fra i bonus: e una CLASSE sul voto, "player-grade yellow-card".
         Senza leggerla i bonus non possono spiegare il fantavoto — su G1 restavano 31
         giocatori su 293 con uno scarto inspiegato di esattamente -0.5. Verificato che i 32
         marcati nel markup sono esattamente quelli con lo scarto.
         Nota: in G1 non c'e nessun rosso, quindi il nome della classe per l'espulsione e
         ancora ignoto; la riconciliazione in validare() lo fara emergere alla prima volta. */
      const ammonito = /class="player-grade yellow-card"/.test(riga);

      /* Le tre pill, in ordine. Serve solo la prima, ma si leggono tutte: se un giorno la
         lega cambiasse fonte, e gia tutto qui senza rifare lo scraping. */
      const pill = [...riga.matchAll(
        /class="player-grade[^"]*" data-value="([^"]*)"[\s\S]*?class="player-fanta-grade" data-value="([^"]*)"/g
      )].map(m => ({ voto: numeroVoto(m[1]), fantavoto: numeroVoto(m[2]) }));

      const bonus = {};
      for (const b of riga.matchAll(/class="player-bonus cell (?:bonus|malus)" data-value="([^"]*)" title="([^"]*)"/g)) {
        const chiave = BONUS[entita(b[2])];
        /* Qui si usa numero() e non numeroVoto(): 55 in un bonus sarebbe un valore vero. */
        if (chiave) bonus[chiave] = numero(b[1]) ?? 0;
      }

      const id = +link[1];
      giocatori[id] = {
        id,
        nome: nome ? pulisci(nome[1]) : null,
        squadra,
        ruolo: ruolo ? RUOLI[ruolo[1]] : null,
        /* `voto` e `fantavoto` sono gli UFFICIALI Fantacalcio.it: quelli della nostra lega. */
        voto: pill[0] ? pill[0].voto : null,
        fantavoto: pill[0] ? pill[0].fantavoto : null,
        /* Comparire in questa pagina significa essere sceso in campo. Se il voto manca, e
           un "senza voto" da subentro tardivo: informazione diversa da "non convocato", che
           in questa pagina non compare proprio. */
        senzaVoto: !!(pill[0] && pill[0].voto == null),
        subentrato: /title="Subentrato"/.test(riga),
        ammonito,
        /* Le altre due fonti restano a disposizione, esplicitamente etichettate. */
        altreFonti: {
          statistico: pill[1] || null,
          italia: pill[2] || null
        },
        bonus
      };
    }
  }

  return {
    schema: SCHEMA,
    generato: new Date().toISOString(),
    fonte: 'fantacalcio.it/voti-fantacalcio-serie-a — voti ufficiali Redazione Fantacalcio',
    stagione: STAGIONE,
    giornata,
    squadre,
    giocatori
  };
}

/* Pesi del punteggio, RICAVATI DAI DATI e non dati per scontati: su G1, 262 giocatori
   quadrano con questi pesi e i restanti 31 quadrano aggiungendo -0.5 per l'ammonizione.
   Zero casi non spiegati su 293. */
const PESI = {
  gol: 3, golSubiti: -1, autogol: -2, rigoriSegnati: 3,
  rigoriSbagliati: -3, rigoriParati: 3, assist: 1, migliorInCampo: 0
};
const MALUS_AMMONIZIONE = -0.5;

/* Ricostruisce il fantavoto dai pezzi. Se non torna, vuol dire che stiamo leggendo male
   qualcosa: la colonna sbagliata, una riga fusa con un'altra, un bonus non mappato. */
function fantavotoRicostruito(g) {
  if (g.voto == null) return null;
  let v = g.voto;
  for (const k in PESI) v += (g.bonus[k] || 0) * PESI[k];
  if (g.ammonito) v += MALUS_AMMONIZIONE;
  return +v.toFixed(2);
}

/* ---------- validazione ----------
   Stessa disciplina dello scraper delle probabili: meglio fermarsi che scrivere uno storico
   plausibile ma sbagliato, perche un punteggio falso non si riconosce piu guardandolo. */
function validare(d, ordineFonti) {
  const problemi = [];
  const gioc = Object.values(d.giocatori);

  if (!ordineFonti.ok) {
    problemi.push('le tre colonne di voto non sono nell ordine atteso — visto: ' + ordineFonti.visto);
  }
  if (d.squadre.length !== 20) problemi.push(`squadre trovate: ${d.squadre.length}, attese 20`);
  if (gioc.length < 200) problemi.push(`giocatori trovati: ${gioc.length}, attesi almeno 200`);

  const senzaRuolo = gioc.filter(g => !g.ruolo).length;
  if (senzaRuolo) problemi.push(`${senzaRuolo} giocatori senza ruolo`);
  const senzaNome = gioc.filter(g => !g.nome).length;
  if (senzaNome) problemi.push(`${senzaNome} giocatori senza nome`);
  const senzaSquadra = gioc.filter(g => !g.squadra).length;
  if (senzaSquadra) problemi.push(`${senzaSquadra} giocatori senza squadra`);

  const conVoto = gioc.filter(g => g.voto != null);
  if (conVoto.length < 150) problemi.push(`solo ${conVoto.length} giocatori con un voto: troppo pochi`);

  /* Un pugno di senza voto per giornata e fisiologico (i subentrati dell'ultimo quarto d'ora).
     Se diventano tantissimi, vuol dire che stiamo leggendo male la pagina. */
  const sv = gioc.filter(g => g.senzaVoto).length;
  if (sv > gioc.length * 0.25) problemi.push(`${sv} giocatori senza voto su ${gioc.length}: troppi, la lettura non torna`);

  /* Un voto fuori da 0-10 vuol dire che stiamo leggendo la casella sbagliata. */
  const fuoriScala = conVoto.filter(g => g.voto < 0 || g.voto > 10);
  if (fuoriScala.length) {
    problemi.push(`${fuoriScala.length} voti fuori dalla scala 0-10 (es. ${fuoriScala[0].nome} = ${fuoriScala[0].voto})`);
  }
  /* Il fantavoto puo uscire dalla scala per via dei bonus, ma non di tanto. */
  const fantaAssurdo = gioc.filter(g => g.fantavoto != null && (g.fantavoto < -5 || g.fantavoto > 25));
  if (fantaAssurdo.length) {
    problemi.push(`${fantaAssurdo.length} fantavoti implausibili (es. ${fantaAssurdo[0].nome} = ${fantaAssurdo[0].fantavoto})`);
  }

  /* La media dei voti di una giornata sta sempre intorno a 6: se no, colonna sbagliata. */
  if (conVoto.length) {
    const media = conVoto.reduce((s, g) => s + g.voto, 0) / conVoto.length;
    if (media < 5.2 || media > 6.8) problemi.push(`media voti della giornata = ${media.toFixed(2)}, fuori dall atteso 5.2-6.8`);
  }

  /* Unicita delle squadre: la lunghezza da sola non basta, cinque tabelle che dichiarano
     tutte "Atalanta" darebbero comunque 20. */
  const uniche = new Set(d.squadre).size;
  if (uniche !== d.squadre.length) problemi.push(`squadre duplicate: ${d.squadre.length} tabelle ma ${uniche} nomi distinti`);

  /* IL CONTROLLO PIU IMPORTANTE. Se il fantavoto non si ricostruisce da voto + bonus, stiamo
     leggendo male qualcosa, e non c'e modo di accorgersene guardando i numeri: sarebbero tutti
     plausibili. Intercetta da solo la colonna di voto sbagliata, le righe fuse fra due
     giocatori, i bonus non mappati e le sentinelle gestite male. */
  const conVotoEFanta = gioc.filter(g => g.voto != null && g.fantavoto != null);
  const nonQuadrano = conVotoEFanta.filter(g => Math.abs(g.fantavoto - fantavotoRicostruito(g)) > 0.01);
  if (nonQuadrano.length) {
    const soglia = Math.max(3, conVotoEFanta.length * 0.02);
    const esempi = nonQuadrano.slice(0, 5).map(g =>
      `${g.nome} voto ${g.voto} fantavoto ${g.fantavoto} ricostruito ${fantavotoRicostruito(g)}`).join('; ');
    if (nonQuadrano.length > soglia) {
      problemi.push(`${nonQuadrano.length} fantavoti non si ricostruiscono da voto+bonus — ${esempi}`);
    } else {
      /* Pochi casi: probabilmente un malus che non conosciamo ancora (l'espulsione, che in
         G1 non compare mai). Si segnala senza bloccare, cosi si impara il markup nuovo. */
      console.warn(`  ATTENZIONE: ${nonQuadrano.length} fantavoti non ricostruiti — ${esempi}`);
    }
  }

  return problemi;
}

/* ---------- esecuzione ---------- */

async function main() {
  const args = process.argv.slice(2);
  const soloProva = args.includes('--prova');
  const giornata = +args.find(a => /^\d+$/.test(a));

  if (!giornata || giornata < 1 || giornata > 38) {
    console.error('Uso: node tools/fetch-voti.mjs <giornata 1-38> [--prova]');
    process.exit(1);
  }

  const url = `https://www.fantacalcio.it/voti-fantacalcio-serie-a/${STAGIONE}/${giornata}`;
  /* Senza timeout una connessione appesa blocca il job della Action fino al limite di GitHub. */
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${url}`);
  const html = await r.text();

  /* Una risposta troncata a meta produce un file valido ma incompleto, e nessuna delle
     validazioni successive se ne accorge se il taglio cade nel punto giusto. */
  if (!/<\/html>\s*$/i.test(html)) throw new Error('la pagina scaricata e troncata (manca la chiusura </html>)');

  /* La pagina di una giornata non ancora giocata esiste comunque, ma e vuota: va detto
     chiaramente invece di scrivere un file di zeri. */
  const dichiarata = /class="matchweek"[^>]*>\s*(\d+)\s*</.exec(html);
  if (dichiarata && +dichiarata[1] !== giornata) {
    throw new Error(`chiesta la giornata ${giornata} ma la pagina dichiara la ${dichiarata[1]}`);
  }

  const ordineFonti = verificaOrdineFonti(html);
  const dati = estrai(html, giornata);
  const problemi = validare(dati, ordineFonti);

  const gioc = Object.values(dati.giocatori);
  const conVoto = gioc.filter(g => g.voto != null);
  const media = conVoto.length ? conVoto.reduce((s, g) => s + g.voto, 0) / conVoto.length : 0;
  console.log(`Giornata ${giornata} — ${dati.squadre.length} squadre, ${gioc.length} giocatori, ` +
    `${conVoto.length} con voto, media ${media.toFixed(2)}`);
  console.log(`Colonne di voto lette: ${ordineFonti.visto}`);

  if (problemi.length) {
    console.error('\nVALIDAZIONE FALLITA:');
    problemi.forEach(p => console.error('  - ' + p));
    console.error('\nNiente scritto: meglio nessuno storico che uno storico falso.');
    process.exit(1);
  }

  if (soloProva) { console.log('\n--prova: validazione superata, niente scritto.'); return; }

  await mkdir(DIR_DATI, { recursive: true });
  const uscita = resolve(DIR_DATI, `voti-${giornata}.json`);
  await writeFile(uscita, JSON.stringify(dati, null, 1) + '\n', 'utf8');
  console.log('Scritto ' + uscita);
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
