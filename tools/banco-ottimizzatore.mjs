/* Prova a ritroso dell'OTTIMIZZATORE vero dell'app (scegliUndici + simulazione + modulo
   automatico), con i punti veri compreso il modificatore di difesa vero (11/11).

   banco-previsioni.mjs misura certezza e resa con un undici scelto "a tavolino"; qui gira il
   blocco intero dell'app (da COSTANTI DI LEGA a classificaModuli), sulle probabili di allora e
   sui voti precedenti, e i punti si contano come li conta la lega: cambi dalla panchina
   nell'ordine dell'app (massimo 3, stesso ruolo) e modificatore sui voti veri. Serve a
   rispondere a "il modulo automatico e il modificatore nella scelta rendono davvero?".
   Risultato dell'11/11 su G3-G11, 150 rose: modulo automatico 68.3 punti a giornata contro
   67.2-67.5 di un modulo fisso; contare il modificatore nella scelta vale +0.11.

   USO   node tools/banco-ottimizzatore.mjs [quante rose, 150]     (circa 2 minuti)
   Non scrive nulla; come banco-previsioni.mjs serve il repository con la sua storia.
   Importabile: prova(nome, {COSTANTE: valore}, scelta) per altre varianti. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { probabiliPrima, storicoFinoA, voti, giornateConVoti, rettificaRuoloFinoA, costruisciMotore, rosaUtente, RADICE } from './banco-previsioni.mjs';
import { pezzo } from './estrai-motore.mjs';

const html = readFileSync(resolve(RADICE, 'index.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const LISTONE = JSON.parse(/<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);

function motoreCompleto(sovra = {}) {
  const da = script.indexOf('const MODULI = ');
  const a = script.indexOf('   STATO');
  let blocco = script.slice(da, script.lastIndexOf('/* ====', a));
  for (const [nome, valore] of Object.entries(sovra)) {
    const re = new RegExp('^const ' + nome + ' = [^;]*;', 'm');
    if (!re.test(blocco)) throw new Error('costante non trovata: ' + nome);
    blocco = blocco.replace(re, 'const ' + nome + ' = ' + JSON.stringify(valore) + ';');
  }
  const src = [
    'let PROB = null, STORICO = {}, RETTIFICA_RUOLO = {P:0,D:0,C:0,A:0}, RETTIFICA_PIAZZATI = {};',
    'const S = {rosa:[], bloccati:{}, override:{}, modulo:"4-3-3"};',
    'const LIS = {}; LISTONE.forEach(p=>{ LIS[p.id] = p; });',
    blocco, pezzo(script, 'rendimento'),
    'calcolaMvSquadre();',
    `return { imposta(o){ if('PROB' in o) PROB=o.PROB; if('STORICO' in o) STORICO=o.STORICO; if(o.RETTIFICA_RUOLO) RETTIFICA_RUOLO=o.RETTIFICA_RUOLO; aggiornaForzaSquadre(); cacheModuliChiave=null; },
      rosa(ids){ S.rosa = ids; cacheModuliChiave=null; }, classificaModuli, scegliUndici, fantamediaStimata, certezza, contributoAtteso, MOD_FASCE, MOD_MIN_DIFENSORI };`
  ].join('\n');
  return new Function('LISTONE', src)(LISTONE);
}

/* seme fisso per Math.random: stesse simulazioni per ogni variante */
function seme(s) { let x = s; Math.random = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }

function roseCasuali(n) {
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = {}, tagli = { P: 40, D: 130, C: 130, A: 80 }, quanti = { P: 3, D: 8, C: 8, A: 6 };
  for (const r in tagli) pool[r] = LISTONE.filter(p => p.r === r).sort((a, b) => b.q - a.q).slice(0, tagli[r]);
  const rose = [];
  for (let i = 0; i < n; i++) { const ids = []; for (const r in quanti) { const c = pool[r].slice(); for (let k = 0; k < quanti[r]; k++) ids.push(c.splice(Math.floor(rnd() * c.length), 1)[0].id); } rose.push(ids); }
  return rose;
}

const byId = Object.fromEntries(LISTONE.map(p => [p.id, p]));
function puntiVeri(u, V, FASCE, MIN_D) {
  const fv = id => { const x = V[id]; return x && x.fantavoto != null ? x : null; };
  const inCampo = []; const buchi = {};
  for (const id of u.titolari) { if (fv(id)) inCampo.push(id); else buchi[byId[id].r] = (buchi[byId[id].r] || 0) + 1; }
  let cambi = 0;
  for (const id of u.panchina) { if (cambi >= 3) break; const r = byId[id].r; if (!buchi[r] || !fv(id)) continue; buchi[r]--; inCampo.push(id); cambi++; }
  let punti = 0; const mvP = [], mvD = [];
  for (const id of inCampo) { const x = fv(id); punti += x.fantavoto; if (x.voto != null) { if (byId[id].r === 'P') mvP.push(x.voto); if (byId[id].r === 'D') mvD.push(x.voto); } }
  mvD.sort((a, b) => b - a);
  let mod = 0;
  if (mvP.length && mvD.length >= MIN_D) { const m = (mvP[0] + mvD[0] + mvD[1] + mvD[2]) / 4; for (const [s, v] of FASCE) if (m >= s) mod = v; }
  return { punti: punti + mod, mod, inCampo: inCampo.length };
}

const N = +(process.argv[2] || 150);
const rose = roseCasuali(N);
const probs = probabiliPrima();
const gv = new Set(giornateConVoti());
const G = Object.keys(probs).map(Number).filter(g => gv.has(g)).sort((a, b) => a - b);
const { motore: puro } = costruisciMotore();
const mia = rosaUtente(LISTONE);

export function prova(nome, sovra = {}, scelta = null) {
  const M = motoreCompleto({ N_SIM: 300, ...sovra });
  const Mref = motoreCompleto({ N_SIM: 1 });
  let tot = 0, totMod = 0, n = 0, miaTot = 0, inCampo = 0; const moduli = {};
  for (const g of G) {
    const st = storicoFinoA(g);
    puro.imposta({ PROB: probs[g], STORICO: st });
    const rr = rettificaRuoloFinoA(puro, LISTONE, g);
    M.imposta({ PROB: probs[g], STORICO: st, RETTIFICA_RUOLO: rr });
    const V = voti(g).giocatori;
    const gira = (ids) => {
      const presenti = ids.filter(id => probs[g].squadre[byId[id].s]);
      M.rosa(ids); seme(777 + g);
      const cl = M.classificaModuli();
      const u = scelta ? scelta(cl, M) : cl[0];
      return { ...puntiVeri(u, V, Mref.MOD_FASCE, Mref.MOD_MIN_DIFENSORI), modulo: u.modulo };
    };
    for (const ids of rose) { const r = gira(ids); tot += r.punti; totMod += r.mod; inCampo += r.inCampo; n++; moduli[r.modulo] = (moduli[r.modulo] || 0) + 1; }
    miaTot += gira(mia).punti;
  }
  console.log(nome.padEnd(46), 'punti', (tot / n).toFixed(3), 'di cui mod', (totMod / n).toFixed(3), 'in campo', (inCampo / n).toFixed(2), 'utente', miaTot.toFixed(1),
    ' moduli:', Object.entries(moduli).sort((a, b) => b[1] - a[1]).map(([m, c]) => m + ' ' + Math.round(c / n * 100) + '%').join(' '));
}

if (process.argv[1].endsWith('banco-ottimizzatore.mjs')) {
  prova('app attuale');
  prova('senza modificatore nella scelta', { MOD_FASCE: [] });
  prova('sempre 3-4-3', {}, cl => cl.find(x => x.modulo === '3-4-3'));
  prova('sempre 4-3-3', {}, cl => cl.find(x => x.modulo === '4-3-3'));
  prova('sempre 4-4-2', {}, cl => cl.find(x => x.modulo === '4-4-2'));
  prova('MOD_INCERTEZZA 0.25', { MOD_INCERTEZZA: 0.25 });
  prova('MOD_INCERTEZZA 0.5', { MOD_INCERTEZZA: 0.5 });
}
