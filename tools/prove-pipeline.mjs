#!/usr/bin/env node
/* Prove ripetibili della parte che gira da sola in CI (calendario, promemoria, voti).

   PERCHE' ESISTE
   Ogni sessione che toccava questi script si ricostruiva a mano un banco di prova (pagina
   salvata, orologio finto, funzioni estratte dallo script...) e lo buttava a fine giornata.
   Qui restano scritti, con l'esito atteso: si lanciano dopo ogni modifica agli script, come
   tools/controlla.mjs dopo ogni modifica all'app. Niente rete, niente secret, niente scritture
   dentro il repository: tutto succede in una cartella temporanea.

   USO
     node tools/prove-pipeline.mjs                       tutte le prove che si possono fare
     node tools/prove-pipeline.mjs calendario promemoria solo alcune sezioni
     node tools/prove-pipeline.mjs voti --pagine DIR     anche i voti, su pagine salvate
       (DIR contiene votiN.html scaricate da fantacalcio.it/voti-fantacalcio-serie-a/2026-27/N:
        le pagine non stanno nel repository, sono del sito)

   Esce con 1 se una prova fallisce.

   COME FA A FINGERE L'ORA
   I promemoria girano come processi separati, con un modulo caricato prima (--import) che
   sostituisce Date con un orologio fermo sull'ora voluta, mette il fuso a UTC come sui runner
   GitHub e finge la funzione Netlify "schierato"; web-push e' sostituito da un finto che scrive
   su file cosa avrebbe spedito. Lo script vero non viene toccato. */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');

const args = process.argv.slice(2);
const iPagine = args.indexOf('--pagine');
const DIR_PAGINE = iPagine !== -1 ? resolve(args[iPagine + 1]) : null;
const richieste = args.filter((a, i) => !a.startsWith('--') && (iPagine === -1 || i !== iPagine + 1));
const SEZIONI = richieste.length ? richieste : ['calendario', 'promemoria', 'ricalibra', 'voti'];

let falliti = 0, passati = 0;
function verifica(nome, ok, dettaglio) {
  if (ok) { passati++; console.log('  ✓ ' + nome); }
  else { falliti++; console.log('  ✗ ' + nome + (dettaglio ? '\n      ' + dettaglio : '')); }
}

/* Partite vere della G6 (dal file delle probabili del 25-26/09): fissate qui, non lette da
   dati/probabili.json, cosi' le prove danno lo stesso esito qualunque giornata ci sia sul disco. */
const G6 = {
  giornata: 6,
  partite: [
    ['sabato 10 ottobre, 15:00', 'Genoa', 'Fiorentina'], ['sabato 10 ottobre, 18:00', 'Inter', 'Parma'],
    ['sabato 10 ottobre, 20:45', 'Napoli', 'Frosinone'], ['domenica 11 ottobre, 12:30', 'Como', 'Roma'],
    ['domenica 11 ottobre, 15:00', 'Lazio', 'Monza'], ['domenica 11 ottobre, 15:00', 'Lecce', 'Bologna'],
    ['domenica 11 ottobre, 18:00', 'Sassuolo', 'Milan'], ['domenica 11 ottobre, 20:45', 'Cagliari', 'Juventus'],
    ['lunedì 12 ottobre, 18:30', 'Atalanta', 'Venezia'], ['lunedì 12 ottobre, 20:45', 'Torino', 'Udinese']
  ].map(([data, casa, trasferta]) => ({ data, casa, trasferta }))
};
/* Prima partita 15:00 italiane = 13:00 UTC (ora legale), scadenza 5 minuti prima. */
const SCADENZA_G6 = Date.parse('2026-10-10T12:55:00Z');

/* ======================================================================================= */

async function proveCalendario() {
  console.log('\nCALENDARIO (tools/calendario.mjs, fuso del processo = UTC come sui runner)');
  const vecchioTZ = process.env.TZ;
  process.env.TZ = 'UTC';
  const VeroDate = Date;
  /* parseData() indovina l'anno da "oggi": serve un orologio finto anche qui. */
  function conOggi(iso, fn) {
    const T = VeroDate.parse(iso);
    class Finto extends VeroDate {
      constructor(...a) { if (a.length) super(...a); else super(T); }
      static now() { return T; }
    }
    globalThis.Date = Finto;
    try { return fn(); } finally { globalThis.Date = VeroDate; }
  }
  const cal = await import(pathToFileURL(join(QUI, 'calendario.mjs')).href + '?prova=' + Date.now());
  const iso = (d) => d ? d.toISOString().slice(0, 16) + 'Z' : String(d);

  const casi = [
    // [oggi, stringa del sito, istante atteso, cosa si prova]
    ['2026-09-26T12:00Z', 'sabato 10 ottobre, 15:00', '2026-10-10T13:00Z', 'ora legale: 15:00 italiane = 13:00 UTC'],
    ['2026-10-20T12:00Z', 'sabato 24 ottobre, 20:45', '2026-10-24T18:45Z', 'sabato prima del cambio d\'ora (ancora legale)'],
    ['2026-10-20T12:00Z', 'domenica 25 ottobre, 12:30', '2026-10-25T11:30Z', 'domenica del cambio d\'ora (gia\' solare)'],
    ['2026-10-20T12:00Z', 'domenica 25 ottobre, 01:30', '2026-10-24T23:30Z', 'notte del cambio, prima delle 03:00 (legale)'],
    ['2026-10-26T12:00Z', 'mercoledì 28 ottobre, 20:45', '2026-10-28T19:45Z', 'ora solare: 20:45 italiane = 19:45 UTC'],
    ['2027-03-25T12:00Z', 'domenica 28 marzo, 15:00', '2027-03-28T13:00Z', 'domenica del ritorno all\'ora legale'],
    ['2027-03-25T12:00Z', 'sabato 27 marzo, 15:00', '2027-03-27T14:00Z', 'sabato prima del ritorno (ancora solare)'],
    ['2026-12-28T12:00Z', 'mercoledì 6 gennaio, 15:00', '2027-01-06T14:00Z', 'a fine dicembre una data di gennaio e\' dell\'anno dopo'],
    ['2027-01-02T12:00Z', 'mercoledì 30 dicembre, 20:45', '2026-12-30T19:45Z', 'a inizio gennaio una partita di 3 giorni fa resta nel 2026'],
    ['2027-01-12T12:00Z', 'sabato 2 gennaio, 15:00', '2027-01-02T14:00Z', 'dieci giorni dopo, una data passata resta passata (niente anno dopo)'],
    ['2027-01-05T12:00Z', 'domenica 27 dicembre, 18:00', '2026-12-27T17:00Z', 'giornata di fine dicembre riletta a inizio gennaio (9 giorni fa)']
  ];
  for (const [oggi, testo, atteso, cosa] of casi) {
    const d = conOggi(oggi, () => cal.parseData(testo));
    verifica(`${cosa}`, iso(d) === atteso, `"${testo}" letto il ${oggi}: ${iso(d)}, atteso ${atteso}`);
  }

  const prima = conOggi('2026-09-26T12:00Z', () => cal.primaPartita(G6));
  verifica('prima partita della G6: Genoa-Fiorentina alle 13:00 UTC',
    prima && prima.casa === 'Genoa' && iso(prima.quando) === '2026-10-10T13:00Z', JSON.stringify(prima));
  verifica('G6 non e\' un turno infrasettimanale', conOggi('2026-09-26T12:00Z', () => cal.infrasettimanale(G6)) === false);
  const infra = { partite: [{ data: 'martedì 27 ottobre, 18:30' }, { data: 'mercoledì 28 ottobre, 20:45' }, { data: 'giovedì 29 ottobre, 20:45' }] };
  verifica('martedi-giovedi e\' un turno infrasettimanale', conOggi('2026-10-20T12:00Z', () => cal.infrasettimanale(infra)) === true);
  const lunedi = { partite: [{ data: 'sabato 10 ottobre, 15:00' }, { data: 'lunedì 12 ottobre, 20:45' }] };
  verifica('weekend con coda al lunedi NON e\' infrasettimanale', conOggi('2026-09-26T12:00Z', () => cal.infrasettimanale(lunedi)) === false);

  if (vecchioTZ === undefined) delete process.env.TZ; else process.env.TZ = vecchioTZ;
}

/* ======================================================================================= */

function preparaBancoPromemoria() {
  const dir = mkdtempSync(join(tmpdir(), 'prove-promemoria-'));
  mkdirSync(join(dir, 'tools')); mkdirSync(join(dir, 'dati'));
  mkdirSync(join(dir, 'node_modules', 'web-push'), { recursive: true });
  copyFileSync(join(QUI, 'promemoria-scadenza.mjs'), join(dir, 'tools', 'promemoria-scadenza.mjs'));
  copyFileSync(join(QUI, 'calendario.mjs'), join(dir, 'tools', 'calendario.mjs'));
  writeFileSync(join(dir, 'node_modules', 'web-push', 'package.json'),
    JSON.stringify({ name: 'web-push', main: 'index.js', type: 'commonjs' }));
  writeFileSync(join(dir, 'node_modules', 'web-push', 'index.js'), `
    const fs = require('fs');
    module.exports = {
      setVapidDetails() {},
      async sendNotification(sub, payload) {
        if (process.env.FINTO_PUSH_ESITO) { const e = new Error('finto'); e.statusCode = +process.env.FINTO_PUSH_ESITO; throw e; }
        fs.appendFileSync(process.env.FINTO_PUSH_LOG, JSON.stringify({ ora: new Date().toISOString(), ...JSON.parse(payload) }) + '\\n');
      }
    };`);
  writeFileSync(join(dir, 'orologio.mjs'), `
    process.env.TZ = 'UTC';
    const T = Date.parse(process.env.ORA_FINTA);
    const Vero = Date;
    globalThis.Date = class extends Vero {
      constructor(...a) { if (a.length) super(...a); else super(T); }
      static now() { return T; }
    };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ schierato: process.env.FINTO_SCHIERATO === '1' }) });
  `);
  return dir;
}

function giroPromemoria(dir, oraIso, extraEnv = {}) {
  const r = spawnSync(process.execPath,
    ['--import', pathToFileURL(join(dir, 'orologio.mjs')).href, join(dir, 'tools', 'promemoria-scadenza.mjs')], {
      env: {
        ...process.env, ORA_FINTA: oraIso, VAPID_PRIVATE_KEY: 'finta', PUSH_SUBSCRIPTION: '{}',
        NETLIFY_SITE_URL: 'https://finto.example', FINTO_PUSH_LOG: join(dir, 'spediti.jsonl'), ...extraEnv
      },
      encoding: 'utf8'
    });
  return { codice: r.status, uscita: (r.stdout || '') + (r.stderr || '') };
}

function azzera(dir, prob) {
  writeFileSync(join(dir, 'dati', 'probabili.json'), JSON.stringify(prob));
  for (const f of ['dati/scadenza-promemoria.json', 'spediti.jsonl']) rmSync(join(dir, f), { force: true });
}
const spediti = (dir) => existsSync(join(dir, 'spediti.jsonl'))
  ? readFileSync(join(dir, 'spediti.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const statoPromemoria = (dir) => JSON.parse(readFileSync(join(dir, 'dati', 'scadenza-promemoria.json'), 'utf8'));

async function provePromemoria() {
  console.log('\nPROMEMORIA (tools/promemoria-scadenza.mjs, G6: scadenza sabato 10/10 12:55 UTC)');
  const dir = preparaBancoPromemoria();
  try {
    /* 1. Cron puntuale ogni 15 minuti: sei promemoria, uno per soglia, tutti prima della scadenza. */
    azzera(dir, G6);
    for (let t = Date.parse('2026-10-09T12:00Z'); t <= Date.parse('2026-10-10T13:15Z'); t += 15 * 60000) {
      giroPromemoria(dir, new Date(t).toISOString());
    }
    const s1 = spediti(dir);
    /* I giri cadono ai quarti d'ora e la scadenza alle :55, quindi il primo giro utile dopo la
       soglia "1h" arriva a 55 minuti dalla scadenza: il testo deve dire 55, non "un'ora". */
    const attesi = [['24 ore', 24], ['12 ore', 12], ['6 ore', 6], ['2 ore', 2], ['55 minuti', 1], ['25 minuti', 0.5]];
    verifica('cron puntuale: 6 promemoria spediti', s1.length === 6, s1.map(x => x.ora + ' ' + x.titolo).join(' | '));
    attesi.forEach(([testo, ore], i) => {
      const x = s1[i];
      const momento = SCADENZA_G6 - ore * 3600000;
      const ok = x && Date.parse(x.ora) >= momento && Date.parse(x.ora) < momento + 15 * 60000 &&
        Date.parse(x.ora) < SCADENZA_G6 && x.titolo === `Mancano ${testo}: schiera la formazione`;
      verifica(`  soglia ${ore}h: spedita al primo giro utile, testo "Mancano ${testo}"`, ok, x ? x.ora + ' ' + x.titolo : 'non spedita');
    });
    verifica('il testo nomina la partita e l\'ora italiana giuste',
      s1[0] && /Giornata 6, si comincia sabato 10 ottobre alle ore 15:00 \(Genoa-Fiorentina\)/.test(s1[0].corpo), s1[0] && s1[0].corpo);

    /* 2. Cron in ritardo di ore (il caso normale su GitHub): a ogni giro al massimo UN promemoria,
       quello della soglia piu' vicina, non una coda di soglie vecchie una dopo l'altra. */
    azzera(dir, G6);
    const giri = ['2026-10-09T20:10Z', '2026-10-10T08:40Z', '2026-10-10T09:30Z', '2026-10-10T11:05Z', '2026-10-10T12:40Z'];
    giri.forEach(g => giroPromemoria(dir, g));
    const s2 = spediti(dir);
    const titoli = s2.map(x => x.ora.slice(11, 16) + ' ' + x.titolo.replace(': schiera la formazione', ''));
    verifica('cron in ritardo: un promemoria per giro, niente code di soglie scadute',
      JSON.stringify(titoli) === JSON.stringify(['20:10 Mancano 17 ore', '08:40 Mancano 4 ore', '11:05 Mancano 2 ore', '12:40 Mancano 15 minuti']),
      JSON.stringify(titoli));
    const st2 = statoPromemoria(dir).inviate;
    verifica('  le soglie assorbite da una piu\' vicina restano segnate come "superata"',
      st2['12h'] === 'superata' && st2['1h'] === 'superata' && typeof st2['6h'] === 'string' && st2['6h'].startsWith('2026'),
      JSON.stringify(st2));

    /* 3. Gia' schierato: nessun promemoria. */
    azzera(dir, G6);
    ['2026-10-09T13:00Z', '2026-10-10T01:00Z', '2026-10-10T12:30Z'].forEach(g => giroPromemoria(dir, g, { FINTO_SCHIERATO: '1' }));
    verifica('gia\' schierato: nessun promemoria', spediti(dir).length === 0, JSON.stringify(spediti(dir)));
    verifica('  ...e le soglie restano "saltata-schierato"',
      Object.values(statoPromemoria(dir).inviate).every(v => v === 'saltata-schierato'), JSON.stringify(statoPromemoria(dir).inviate));

    /* 4. Abbonamento scaduto (410): errore UNA volta sola per giornata. */
    azzera(dir, G6);
    const a = giroPromemoria(dir, '2026-10-09T13:00Z', { FINTO_PUSH_ESITO: '410' });
    const b = giroPromemoria(dir, '2026-10-10T01:00Z', { FINTO_PUSH_ESITO: '410' });
    verifica('abbonamento scaduto: il primo giro fallisce (email), il secondo no',
      a.codice === 1 && /::error::/.test(a.uscita) && b.codice === 0, `codici ${a.codice}, ${b.codice}`);
    verifica('  ...e nel file di stato resta "abbonamento-scaduto"',
      statoPromemoria(dir).inviate['24h'] === 'abbonamento-scaduto', JSON.stringify(statoPromemoria(dir).inviate));

    /* 5. Giro arrivato dopo la scadenza: niente promemoria. */
    azzera(dir, G6);
    const c = giroPromemoria(dir, '2026-10-10T13:10Z');
    verifica('giro dopo la scadenza: niente spedito, soglie "saltata"',
      spediti(dir).length === 0 && c.codice === 0 && statoPromemoria(dir).inviate['30m'] === 'saltata', c.uscita.trim());

    /* 6. Giornata nuova: lo stato riparte da zero. */
    azzera(dir, G6);
    giroPromemoria(dir, '2026-10-09T13:00Z');
    const G7 = { giornata: 7, partite: [{ data: 'sabato 17 ottobre, 15:00', casa: 'Roma', trasferta: 'Lazio' }] };
    writeFileSync(join(dir, 'dati', 'probabili.json'), JSON.stringify(G7));
    giroPromemoria(dir, '2026-10-16T13:30Z');
    const st6 = statoPromemoria(dir);
    verifica('giornata nuova: stato ripartito da zero e 24h della G7 spedita',
      st6.giornata === 7 && Object.keys(st6.inviate).length === 1 && spediti(dir).length === 2, JSON.stringify(st6));

    /* 7. Cambio d'ora: scadenza di una giornata che comincia domenica 25/10 (gia' ora solare). */
    azzera(dir, { giornata: 8, partite: [{ data: 'domenica 25 ottobre, 12:30', casa: 'Como', trasferta: 'Inter' }] });
    const prima = giroPromemoria(dir, '2026-10-24T11:20Z');   // 24h prima della scadenza 11:25Z, meno 5 minuti
    const dopo = giroPromemoria(dir, '2026-10-24T11:26Z');
    const s7 = spediti(dir);
    verifica('cambio d\'ora (25/10): la soglia 24h scatta alle 11:25 UTC, non un\'ora prima o dopo',
      s7.length === 1 && s7[0].ora.startsWith('2026-10-24T11:26') && s7[0].titolo.startsWith('Mancano 24 ore'),
      JSON.stringify(s7) + ' ' + prima.uscita.trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ======================================================================================= */

function proveVoti() {
  console.log('\nVOTI (tools/fetch-voti.mjs --prova --da-file, su pagine salvate)');
  if (!DIR_PAGINE) {
    console.log('  – saltate: servono pagine salvate (--pagine DIR con votiN.html), non stanno nel repository');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'prove-voti-'));
  const esegui = (g, file) => spawnSync(process.execPath,
    [join(QUI, 'fetch-voti.mjs'), String(g), '--prova', '--da-file', file], { encoding: 'utf8' });
  try {
    const pagine = [];
    for (let g = 1; g <= 38; g++) if (existsSync(join(DIR_PAGINE, `voti${g}.html`))) pagine.push(g);
    if (!pagine.length) { verifica('pagine trovate in ' + DIR_PAGINE, false, 'nessun votiN.html'); return; }

    const complete = [];
    for (const g of pagine) {
      const r = esegui(g, join(DIR_PAGINE, `voti${g}.html`));
      if (r.status === 0) complete.push(g);
      verifica(`G${g} vera: uscita ${r.status}`, r.status === 0 || r.status === 2, (r.stdout + r.stderr).trim().split('\n').pop());
    }
    if (!complete.length) { console.log('  – nessuna giornata completa fra le pagine: sabotaggi saltati'); return; }

    const g = complete[complete.length - 1];
    const h = readFileSync(join(DIR_PAGINE, `voti${g}.html`), 'utf8');
    const tab = '<table class="grades-table';
    const sabotaggi = [
      ['una partita ancora in corso (stato 2)', h.replace('data-match-status="4"', 'data-match-status="2"'), 2],
      ['due tabelle in meno (giornata in corso)', h.split(tab).slice(0, -2).join(tab) + '</html>', 2],
      ['tabella di una squadra svuotata', (() => {
        const i = h.indexOf(tab), j = h.indexOf('<tbody', i), k = h.indexOf('</tbody>', j);
        return h.slice(0, j) + '<tbody>' + h.slice(k);
      })(), 1],
      ['pagina troncata', h.slice(0, Math.floor(h.length * 0.7)), 1],
      ['giornata dichiarata diversa', h.replace(/(class="matchweek"[^>]*>\s*)\d+/, '$199'), 1]
    ];
    for (const [nome, html, atteso] of sabotaggi) {
      const f = join(dir, 'pagina.html');
      writeFileSync(f, html);
      const r = esegui(g, f);
      verifica(`G${g} sabotata, ${nome}: uscita ${atteso}`, r.status === atteso,
        `uscita ${r.status}: ` + (r.stdout + r.stderr).trim().split('\n').pop());
    }
    const senzaStato = join(dir, 'pagina.html');
    writeFileSync(senzaStato, h.replace(/ data-match-status="\d+"/g, ''));
    const r = esegui(g, senzaStato);
    verifica(`G${g} senza stati di partita: passa ma con avviso nel log`,
      r.status === 0 && /::warning::/.test(r.stdout), `uscita ${r.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ======================================================================================= */

/* Ricalibrazione su una copia: replay da zero, un passo per ogni arrivo di voti (G1 e G2 sono
   arrivate insieme il 04/09), e deve tornare cifra per cifra dati/costanti.json. Poi un secondo
   lancio sugli stessi voti non deve cambiare nulla (bug del 26/09: un passo per ogni lancio). */
function proveRicalibra() {
  console.log('\nRICALIBRAZIONE (tools/ricalibra.mjs, replay su una copia di dati/)');
  const voti = [];
  for (let g = 1; g <= 38; g++) if (existsSync(join(RADICE, 'dati', `voti-${g}.json`))) voti.push(g);
  if (voti.length < 2) { console.log('  – saltate: meno di due giornate di voti'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'prove-ricalibra-'));
  try {
    mkdirSync(join(dir, 'tools')); mkdirSync(join(dir, 'dati'));
    copyFileSync(join(RADICE, 'index.html'), join(dir, 'index.html'));
    for (const f of ['ricalibra.mjs', 'estrai-motore.mjs']) copyFileSync(join(QUI, f), join(dir, 'tools', f));
    const lancia = () => spawnSync(process.execPath, [join(dir, 'tools', 'ricalibra.mjs')], { encoding: 'utf8' });
    /* Gli arrivi veri si leggono dalla storia git (commit che ha aggiunto ogni voti-N.json):
       se il cron recupera due giornate nello stesso giro, in CI sono un passo solo, e il
       replay deve fare lo stesso. Senza git si ripiega su "G1+G2 insieme, poi una alla volta". */
    let arrivi;
    try {
      const perCommit = new Map();
      for (const g of voti) {
        const c = spawnSync('git', ['log', '--diff-filter=A', '--format=%H', '--', `dati/voti-${g}.json`],
          { cwd: RADICE, encoding: 'utf8' }).stdout.trim().split('\n').pop();
        if (!c) throw new Error('senza storia');
        if (!perCommit.has(c)) perCommit.set(c, []);
        perCommit.get(c).push(g);
      }
      arrivi = [...perCommit.values()].sort((a, b) => a[0] - b[0]);
    } catch (e) {
      arrivi = [[1, 2], ...voti.filter(g => g > 2).map(g => [g])];
    }
    console.log('  arrivi dei voti: ' + arrivi.map(a => a.join('+')).join(', '));
    for (const gruppo of arrivi) {
      for (const g of gruppo) copyFileSync(join(RADICE, 'dati', `voti-${g}.json`), join(dir, 'dati', `voti-${g}.json`));
      lancia();
    }
    const leggi = (p) => JSON.parse(readFileSync(p, 'utf8'));
    const replay = leggi(join(dir, 'dati', 'costanti.json'));
    const vero = leggi(join(RADICE, 'dati', 'costanti.json'));
    const confronta = (c) => JSON.stringify([c.giornateUsate, c.rettificaRuolo, c.rettificaPiazzati]);
    verifica('il replay da zero ridà dati/costanti.json', confronta(replay) === confronta(vero),
      `replay ${confronta(replay)}\n      file   ${confronta(vero)}`);
    const prima = readFileSync(join(dir, 'dati', 'costanti.json'), 'utf8');
    const r = lancia();
    verifica('rilanciato sugli stessi voti non cambia nulla',
      readFileSync(join(dir, 'dati', 'costanti.json'), 'utf8') === prima && /Nessuna giornata nuova/.test(r.stdout), r.stdout.trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ======================================================================================= */

for (const s of SEZIONI) {
  if (s === 'calendario') await proveCalendario();
  else if (s === 'promemoria') await provePromemoria();
  else if (s === 'ricalibra') proveRicalibra();
  else if (s === 'voti') proveVoti();
  else { console.error('Sezione sconosciuta: ' + s); process.exit(1); }
}
console.log(`\n${passati} prove passate, ${falliti} fallite.`);
process.exit(falliti ? 1 : 0);
