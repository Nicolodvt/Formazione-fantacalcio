/* Prova a ritroso del modello previsionale (30/10): per ogni giornata giocata, fa girare il
   motore VERO di index.html con le sole informazioni che l'app aveva prima del calcio d'inizio
   (le probabili dell'ultimo giro prima della prima partita, i voti delle giornate precedenti,
   la correzione di ruolo come l'avrebbe calcolata ricalibra.mjs fino a li') e lo confronta con
   come e' andata davvero.

   PERCHE'
   taratura.mjs guarda solo la stima PURA da quotazioni, contro la media di tutta la stagione:
   dice se la scala e' giusta, non se l'app sceglie bene la domenica. Qui si misura la domanda
   vera: con quello che sapeva, quanti punti avrebbe fatto la formazione consigliata.

   DA DOVE VENGONO LE PROBABILI DI ALLORA
   Dalla storia git di dati/probabili.json (la Action la committa a ogni giro): per ogni
   giornata, l'ultima versione committata prima della prima partita. Serve quindi il repository
   con la sua storia, non solo i file.

   COSA MISURA
   - certezza: punteggio di Brier (errore quadratico fra probabilita' data e "ha preso voto
     si'/no"), e la tabella di calibrazione per fasce;
   - resa: errore quadratico medio fra resa attesa (fantamedia + partita) e fantavoto, sui soli
     giocatori che hanno preso voto;
   - scelte: su 400 rose a caso (sempre le stesse, seme fisso) e sulla rosa vera dell'utente,
     quanti punti fa l'undici scelto dal modello, contro il massimo possibile col senno di poi.
     Il modificatore di difesa resta fuori: qui conta chi si schiera, non come si somma.

   USO
     node tools/banco-previsioni.mjs              resoconto completo
     node tools/banco-previsioni.mjs --griglia    confronto di varianti delle costanti
   Importabile: valuta(sovrascritture) restituisce i numeri, per provare varianti senza
   toccare index.html. */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { pezzo } from './estrai-motore.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
export const RADICE = resolve(QUI, '..');

/* ---------- il motore, estratto da index.html ---------- */

/* Tutto il blocco dei modelli (da MODELLO 1 all'OTTIMIZZATORE escluso) piu' rendimento():
   prendere il blocco intero invece di un elenco di funzioni fa si' che una funzione nuova
   aggiunta li' dentro entri nella prova senza doversi ricordare di aggiungerla qui. */
export function costruisciMotore(sovrascritture = {}, html = null) {
  html ||= readFileSync(resolve(RADICE, 'index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const LISTONE = JSON.parse(/<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  const da = script.indexOf('const MV_MIN = ');
  const a = script.indexOf('   OTTIMIZZATORE');
  if (da < 0 || a < 0) throw new Error('blocco dei modelli non trovato in index.html');
  let blocco = script.slice(da, script.lastIndexOf('/* ====', a));
  for (const [nome, valore] of Object.entries(sovrascritture)) {
    const re = new RegExp('^const ' + nome + ' = [^;]*;', 'm');
    if (!re.test(blocco)) throw new Error('costante non trovata: ' + nome);
    blocco = blocco.replace(re, 'const ' + nome + ' = ' + JSON.stringify(valore) + ';');
  }
  const sorgente = [
    'let PROB = null, STORICO = {}, RETTIFICA_RUOLO = {P:0, D:0, C:0, A:0}, RETTIFICA_PIAZZATI = {};',
    'const S = {override:{}};',
    'const LIS = {}; LISTONE.forEach(p=>{ LIS[p.id] = p; });',
    blocco,
    pezzo(script, 'rendimento'),
    'calcolaMvSquadre();',
    `return {
      imposta(o){
        if('PROB' in o) PROB = o.PROB;
        if('STORICO' in o) STORICO = o.STORICO;
        if(o.RETTIFICA_RUOLO) RETTIFICA_RUOLO = o.RETTIFICA_RUOLO;
        aggiornaForzaSquadre();
      },
      certezza, fantamediaAttesa, fantamediaStimata, rettificaPartita, mvStimata, rendimento
    };`
  ].join('\n');
  const motore = new Function('LISTONE', sorgente)(LISTONE);
  return { motore, LISTONE };
}

/* ---------- dati ---------- */

export function giornateConVoti() {
  return readdirSync(resolve(RADICE, 'dati'))
    .map(f => /^voti-(\d+)\.json$/.exec(f)).filter(Boolean)
    .map(m => Number(m[1])).sort((a, b) => a - b);
}

const cacheVoti = {};
export function voti(g) {
  return cacheVoti[g] ||= JSON.parse(readFileSync(resolve(RADICE, 'dati', `voti-${g}.json`), 'utf8'));
}

/* Stessa forma delle voci che caricaStoricoOra() mette in STORICO sul telefono. */
export function storicoFinoA(g) {
  const st = {};
  for (let k = 1; k < g; k++) {
    let V; try { V = voti(k); } catch { continue; }
    for (const id in V.giocatori) {
      const x = V.giocatori[id], b = x.bonus || {};
      (st[id] ||= []).push({
        giornata: k, voto: x.voto, fantavoto: x.fantavoto, senzaVoto: !!x.senzaVoto,
        subentrato: !!x.subentrato, gol: b.gol || 0, assist: b.assist || 0,
        rigoriSegnati: b.rigoriSegnati || 0, rigoriSbagliati: b.rigoriSbagliati || 0,
        rigoriParati: b.rigoriParati || 0, autogol: b.autogol || 0, golSubiti: b.golSubiti || 0,
        ammonito: !!x.ammonito
      });
    }
  }
  return st;
}

/* Inizio della giornata in UTC dal calendario (data e ora italiane). */
function inizioGiornata(partite) {
  const t = partite.map(p => {
    const [a, m, d] = p.data.split('-').map(Number);
    const [h, mi] = (p.ora || '00:00').split(':').map(Number);
    const guess = Date.UTC(a, m - 1, d, h, mi);
    const roma = new Date(guess).toLocaleString('en-GB', { timeZone: 'Europe/Rome', hour12: false });
    const [dd, oo] = roma.split(', ');
    const [hh, mm] = oo.split(':').map(Number);
    const scarto = ((hh * 60 + mm) - (h * 60 + mi) + 1440) % 1440;
    return guess - scarto * 60000;
  });
  return Math.min(...t);
}

let cacheProbabili = null;
export function probabiliPrima() {
  if (cacheProbabili) return cacheProbabili;
  const cal = JSON.parse(readFileSync(resolve(RADICE, 'dati', 'calendario.json'), 'utf8')).giornate;
  const inizio = {};
  for (const [g, p] of Object.entries(cal)) inizio[g] = inizioGiornata(p);
  const git = (...a) => execFileSync('git', a, { cwd: RADICE, encoding: 'utf8', maxBuffer: 1 << 28 });
  const righe = git('log', '--format=%H|%cI', '--', 'dati/probabili.json').trim().split('\n');
  const scelte = {};
  for (const r of righe) {
    const [h, d] = r.split('|');
    const t = new Date(d).getTime();
    /* Le giornate si cercano dal commit: il file si legge solo per quelli candidati. */
    let p; try { p = JSON.parse(git('show', h + ':dati/probabili.json')); } catch { continue; }
    const g = p.giornata;
    if (!inizio[g] || t > inizio[g]) continue;
    if (!scelte[g] || scelte[g].t < t) scelte[g] = { t, p };
  }
  cacheProbabili = Object.fromEntries(Object.entries(scelte).map(([g, x]) => [g, x.p]));
  return cacheProbabili;
}

/* Correzione di ruolo come l'avrebbe tenuta ricalibra.mjs prima della giornata g: un passo
   per ogni giornata di voti arrivata, sugli stessi parametri (soglia 30, limite 0.4, passo 0.3). */
function rettificaRuoloFinoA(motore, LISTONE, g) {
  const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));
  const r = { P: 0, D: 0, C: 0, A: 0 };
  const perRuolo = { P: [], D: [], C: [], A: [] };
  for (let k = 1; k < g; k++) {
    let V; try { V = voti(k); } catch { continue; }
    for (const x of Object.values(V.giocatori)) {
      const l = byId[x.id];
      if (x.fantavoto == null || !l) continue;
      const s = motore.fantamediaStimata(l);
      if (s != null) perRuolo[l.r].push(x.fantavoto - s);
    }
    for (const ruolo in r) {
      const c = perRuolo[ruolo];
      if (c.length < 30) continue;
      const ob = Math.max(-0.4, Math.min(0.4, c.reduce((s, v) => s + v, 0) / c.length));
      r[ruolo] = r[ruolo] + 0.3 * (ob - r[ruolo]);
    }
  }
  return r;
}

/* ---------- le rose ---------- */

const ROSA_UTENTE = {
  P: ['Falcone', 'Okoye', 'Skorupski'],
  D: ['Bisseck', 'Comuzzo', 'Delprato', 'Di Lorenzo', 'Idzes', 'Marusic', 'Spence', 'Spinazzola'],
  C: ['Frattesi', 'Paz N.', 'Politano', 'Vergara', 'Vlasic', 'Winks', 'Zambo Anguissa', 'Zaniolo'],
  A: ['Berardi', 'Davis K.', 'Esposito F.P.', 'Kean', 'Laurientè', 'Raspadori']
};
export function rosaUtente(LISTONE) {
  const ids = [];
  for (const [r, nomi] of Object.entries(ROSA_UTENTE)) for (const n of nomi) {
    const p = LISTONE.find(x => x.r === r && x.n === n);
    if (p) ids.push(p.id);
  }
  return ids;
}

/* Rose a caso ma plausibili: i giocatori di una lega vera stanno nella parte alta del listone,
   non fra le terze scelte. Seme fisso, cosi' due varianti si confrontano sulle stesse rose. */
function roseCasuali(LISTONE, n) {
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = {};
  const tagli = { P: 40, D: 130, C: 130, A: 80 };
  for (const r in tagli) pool[r] = LISTONE.filter(p => p.r === r).sort((a, b) => b.q - a.q).slice(0, tagli[r]);
  const quanti = { P: 3, D: 8, C: 8, A: 6 };
  const rose = [];
  for (let i = 0; i < n; i++) {
    const ids = [];
    for (const r in quanti) {
      const c = pool[r].slice();
      for (let k = 0; k < quanti[r]; k++) ids.push(c.splice(Math.floor(rnd() * c.length), 1)[0].id);
    }
    rose.push(ids);
  }
  return rose;
}

const MODULI = { '3-4-3': [3, 4, 3], '3-5-2': [3, 5, 2], '4-3-3': [4, 3, 3], '4-4-2': [4, 4, 2], '4-5-1': [4, 5, 1], '5-3-2': [5, 3, 2], '5-4-1': [5, 4, 1] };

/* Undici dal valore atteso, panchina in ordine di valore, cambi automatici per ruolo (al massimo
   3), punti veri. Lo stesso per il "senno di poi", ordinando sul fantavoto vero. */
function puntiUndici(ids, valore, vero) {
  let migliore = null;
  for (const [mod, [d, c, a]] of Object.entries(MODULI)) {
    const need = { P: 1, D: d, C: c, A: a };
    const titolari = [], panchina = [];
    let atteso = 0;
    for (const r of ['P', 'D', 'C', 'A']) {
      const ord = ids.filter(id => id.r === r).sort((x, y) => valore(y) - valore(x));
      titolari.push(...ord.slice(0, need[r]));
      panchina.push(...ord.slice(need[r]));
      ord.slice(0, need[r]).forEach(x => atteso += valore(x));
    }
    if (!migliore || atteso > migliore.atteso) migliore = { atteso, titolari, panchina, mod };
  }
  let punti = 0, cambi = 0;
  const usati = new Set();
  for (const t of migliore.titolari) {
    const v = vero(t);
    if (v != null) { punti += v; continue; }
    if (cambi >= 3) continue;
    const sost = migliore.panchina.find(b => b.r === t.r && !usati.has(b) && vero(b) != null);
    if (sost) { usati.add(sost); cambi++; punti += vero(sost); }
  }
  return { punti, modulo: migliore.mod };
}

/* ---------- valutazione ---------- */

export function valuta(sovrascritture = {}, opzioni = {}) {
  const { motore, LISTONE } = costruisciMotore(sovrascritture, opzioni.html);
  const probs = probabiliPrima();
  const gv = new Set(giornateConVoti());
  const giornate = Object.keys(probs).map(Number).filter(g => gv.has(g)).sort((a, b) => a - b);
  const rose = opzioni.rose || roseCasuali(LISTONE, 400);
  const mia = rosaUtente(LISTONE);
  const tot = { brier: 0, nb: 0, se: 0, ns: 0, punti: 0, oracolo: 0, nr: 0, miaPunti: 0, miaOracolo: 0 };
  const calib = {};
  const perGiornata = [];
  for (const g of giornate) {
    const PROB = probs[g];
    motore.imposta({ PROB, STORICO: storicoFinoA(g) });
    motore.imposta({ RETTIFICA_RUOLO: rettificaRuoloFinoA(motore, LISTONE, g) });
    const V = voti(g).giocatori;
    const pred = new Map();
    for (const l of LISTONE) {
      if (!PROB.squadre[l.s]) continue;
      const x = V[l.id];
      const fv = x && x.fantavoto != null ? x.fantavoto : null;
      const c = opzioni.certezzaVera ? (fv != null ? 1 : 0) : motore.certezza(l.id);
      const resa = (opzioni.resaVera && fv != null) ? fv : motore.fantamediaAttesa(l) + motore.rettificaPartita(l);
      pred.set(l.id, { l, c, resa, val: c * resa, fv });
      tot.brier += (c - (fv != null ? 1 : 0)) ** 2; tot.nb++;
      const f = Math.min(9, Math.floor(c * 10));
      (calib[f] ||= { n: 0, si: 0, somma: 0 }); calib[f].n++; calib[f].somma += c; if (fv != null) calib[f].si++;
      if (fv != null) { tot.se += (resa - fv) ** 2; tot.ns++; }
    }
    const conv = (ids) => ids.map(id => pred.get(id)).filter(Boolean).map(x => ({ ...x, r: x.l.r }));
    let pg = 0, og = 0;
    for (const ids of rose) {
      const membri = conv(ids);
      const m = puntiUndici(membri, x => x.val, x => x.fv);
      const o = puntiUndici(membri, x => (x.fv == null ? -99 : x.fv), x => x.fv);
      pg += m.punti; og += o.punti;
    }
    tot.punti += pg; tot.oracolo += og; tot.nr += rose.length;
    const membriMia = conv(mia);
    const mm = puntiUndici(membriMia, x => x.val, x => x.fv);
    const mo = puntiUndici(membriMia, x => (x.fv == null ? -99 : x.fv), x => x.fv);
    tot.miaPunti += mm.punti; tot.miaOracolo += mo.punti;
    perGiornata.push({ g, rose: pg / rose.length, oracolo: og / rose.length, mia: mm.punti, miaOracolo: mo.punti, modulo: mm.modulo });
  }
  return {
    giornate,
    brier: tot.brier / tot.nb,
    rmseResa: Math.sqrt(tot.se / tot.ns),
    puntiRose: tot.punti / tot.nr,
    persiRose: (tot.oracolo - tot.punti) / tot.nr,
    miaPunti: tot.miaPunti, miaOracolo: tot.miaOracolo,
    calib, perGiornata
  };
}

/* ---------- uso da riga di comando ---------- */

function stampa(nome, r, base) {
  const d = (v, b, inv) => b == null ? '' : ' (' + ((inv ? b - v : v - b) >= 0 ? '+' : '') + (inv ? b - v : v - b).toFixed(3) + ')';
  console.log(nome.padEnd(34) +
    ' Brier ' + r.brier.toFixed(4) + d(r.brier, base && base.brier, true) +
    '  RMSE resa ' + r.rmseResa.toFixed(3) + d(r.rmseResa, base && base.rmseResa, true) +
    '  punti/giornata ' + r.puntiRose.toFixed(2) + d(r.puntiRose, base && base.puntiRose) +
    '  rosa utente ' + r.miaPunti.toFixed(1));
}

/* ---------- ristima della calibrazione della certezza ----------
   Regressione logistica, separata per titolari e riserve, di "ha preso voto" sul logit della
   percentuale delle probabili e sulla quota delle ultime 3 giornate giocate. Solo convocati
   senza indisponibilita' (gli infortunati e i dubbi hanno i loro tetti in certezza()). Stampa i
   coefficienti su tutte le giornate e il Brier lasciando fuori una giornata alla volta. */
export function ristimaCertezza() {
  const { LISTONE } = costruisciMotore();
  const probs = probabiliPrima();
  const gv = new Set(giornateConVoti());
  const righe = [];
  for (const g of Object.keys(probs).map(Number).filter(g => gv.has(g))) {
    const P = probs[g], ST = storicoFinoA(g), V = voti(g).giocatori;
    for (const l of LISTONE) {
      const pr = P.giocatori[l.id];
      if (!P.squadre[l.s] || !pr || P.indisponibili[l.id]) continue;
      const pct = Math.max(1, Math.min(99, pr.pct == null ? (pr.titolare ? 85 : 20) : pr.pct)) / 100;
      const giocate = (ST[l.id] || []).filter(v => v.giornata >= g - 3 && v.fantavoto != null).length / 3;
      const x = V[l.id];
      righe.push({ g, tit: pr.titolare, f: [1, Math.log(pct / (1 - pct)), giocate], y: x && x.fantavoto != null ? 1 : 0 });
    }
  }
  const sig = z => 1 / (1 + Math.exp(-z));
  const fit = (rs) => {
    let w = [0, 0, 0];
    for (let it = 0; it < 4000; it++) {
      const gr = [0, 0, 0];
      for (const r of rs) { const p = sig(r.f[0] * w[0] + r.f[1] * w[1] + r.f[2] * w[2]); r.f.forEach((v, i) => gr[i] += (p - r.y) * v); }
      w = w.map((v, i) => v - 0.8 * gr[i] / rs.length);
    }
    return w;
  };
  const p = (w, r) => sig(r.f[0] * w[0] + r.f[1] * w[1] + r.f[2] * w[2]);
  let b = 0;
  for (const g of new Set(righe.map(r => r.g))) {
    const tr = righe.filter(r => r.g !== g);
    const wT = fit(tr.filter(r => r.tit)), wR = fit(tr.filter(r => !r.tit));
    for (const r of righe.filter(r => r.g === g)) b += (p(r.tit ? wT : wR, r) - r.y) ** 2;
  }
  const arr = w => '[' + w.map(v => v.toFixed(2)).join(', ') + ']';
  console.log('convocati senza indisponibilita: ' + righe.length + ', giornate ' + [...new Set(righe.map(r => r.g))].join(', '));
  console.log('Brier fuori campione (una giornata lasciata fuori alla volta): ' + (b / righe.length).toFixed(4));
  console.log('const CERTEZZA_TITOLARE = ' + arr(fit(righe.filter(r => r.tit))) + ';');
  console.log('const CERTEZZA_RISERVA = ' + arr(fit(righe.filter(r => !r.tit))) + ';');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--certezza')) { ristimaCertezza(); process.exit(0); }
  const base = valuta();
  console.log('PROVA A RITROSO — giornate ' + base.giornate.join(', ') + ' (probabili di allora, voti precedenti)\n');
  stampa('modello attuale', base);
  console.log('\nper giornata (punti medi su 400 rose a caso | rosa utente):');
  for (const x of base.perGiornata) console.log('  G' + x.g + '  modello ' + x.rose.toFixed(1) + '  senno di poi ' + x.oracolo.toFixed(1) +
    '   | utente: modello ' + x.mia.toFixed(1) + ' (' + x.modulo + ')  senno di poi ' + x.miaOracolo.toFixed(1));
  console.log('\ncalibrazione della certezza (fascia: data -> vera, casi):');
  for (const f of Object.keys(base.calib).sort((a, b) => a - b)) {
    const c = base.calib[f];
    console.log('  ' + (f * 10 + '-' + (f * 10 + 10) + '%').padEnd(9) + (c.somma / c.n * 100).toFixed(0).padStart(4) + '% -> ' + (c.si / c.n * 100).toFixed(0).padStart(3) + '%   ' + c.n);
  }
  if (process.argv.includes('--griglia')) {
    console.log('\nvarianti (fra parentesi: meglio se positivo):');
    const varianti = [
      ['PESO_PRIOR_STAGIONE 5', { PESO_PRIOR_STAGIONE: 5 }],
      ['PESO_PRIOR_STAGIONE 3', { PESO_PRIOR_STAGIONE: 3 }],
      ['DECADIMENTO_FORMA 0.7', { DECADIMENTO_FORMA: 0.7 }],
      ['DECADIMENTO_FORMA 1', { DECADIMENTO_FORMA: 1 }],
      ['CASA_BONUS 0', { CASA_BONUS: 0 }],
      ['CASA_BONUS 0.2', { CASA_BONUS: 0.2 }],
      ['PESO_AVVERSARIO 0', { PESO_AVVERSARIO: 0 }],
      ['PESO_AVVERSARIO 2.5', { PESO_AVVERSARIO: 2.5 }]
    ];
    for (const [n, s] of varianti) stampa(n, valuta(s), base);
  }
}
