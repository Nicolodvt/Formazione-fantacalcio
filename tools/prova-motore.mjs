/* Prove sulle INVARIANTI del motore di scelta della formazione.

   PERCHE' ESISTE
   Il bug peggiore del progetto — l'app che preferiva chi NON gioca — e passato attraverso ogni
   controllo che avevo scritto, perche i test usavano una rosa "sana" con valori uniformi:
   i tre portieri di prova erano tutti al 90%, e a certezza costante l'ordinamento tornava
   giusto per caso. Il difetto esisteva solo quando le certezze DIFFERISCONO fra loro.

   Questo file non prova casi particolari: prova proprieta che devono valere SEMPRE, su dati
   costruiti apposta per variare. La prima e la piu importante e la dominanza.

   Le formule non sono ricopiate: vengono estratte da index.html ed eseguite, cosi le due
   versioni non possono divergere.

   USO
     node tools/prova-motore.mjs
*/

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');

const html = readFileSync(resolve(RADICE, 'index.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const LISTONE = JSON.parse(/<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
const PROB = JSON.parse(readFileSync(resolve(RADICE, 'dati', 'probabili.json'), 'utf8'));

function pezzo(nome, tipo = 'function') {
  const re = tipo === 'function'
    ? new RegExp('^function ' + nome + '\\([\\s\\S]*?\\n\\}', 'm')
    : new RegExp('^const ' + nome + ' = [\\s\\S]*?;', 'm');
  const m = re.exec(script);
  if (!m) throw new Error('non trovato nel sorgente: ' + nome);
  return m[0];
}

/* Ambiente minimo per far girare il motore fuori dal browser. */
const sorgente = [
  "const ROLE_ORDER = ['P','D','C','A'];",
  'const MV_MIN = 5.75, MV_MAX = 6.15, MV_AGG_MAX = 0.12;',
  'let MV_SQUADRA = {};',
  'const LIS = {}; LISTONE.forEach(p=> LIS[p.id]=p);',
  pezzo('MV_ZONA', 'const'), pezzo('BONUS_MAX', 'const'), pezzo('BONUS_CURVA', 'const'),
  pezzo('BONUS_PIAZZATI', 'const'), pezzo('MALUS_FISSO', 'const'), pezzo('SUBENTRO', 'const'),
  pezzo('MODULI', 'const'), pezzo('SLOT_MAX', 'const'), pezzo('MAX_CAMBI', 'const'),
  pezzo('MOD_RIF', 'const'), pezzo('MOD_PESO', 'const'), pezzo('N_SIM', 'const'),
  pezzo('calcolaMvSquadre'), pezzo('mvStimata'), pezzo('golSubitiAttesi'), pezzo('fantamediaAttesa'),
  pezzo('datiGiornata'), pezzo('certezza'), pezzo('contributoAtteso'),
  pezzo('scegliUndici'), pezzo('simula'), pezzo('valuta'), pezzo('classificaModuli'),
  'calcolaMvSquadre();',
  'return { fantamediaAttesa, certezza, contributoAtteso, scegliUndici, valuta, classificaModuli, LIS };'
].join('\n\n');

const S = { rosa: [], bloccati: {}, override: {}, modulo: '4-3-3' };
const M = new Function('LISTONE', 'PROB', 'S', sorgente)(LISTONE, PROB, S);

/* ---------- utilita' ---------- */
let falliti = 0;
const ok = (t) => console.log('  OK   ' + t);
const ko = (t, dett) => { falliti++; console.log('  FALLITA  ' + t); (dett || []).forEach(d => console.log('           ' + d)); };

const perRuolo = (r) => LISTONE.filter(p => p.r === r);

/* ---------- 1. DOMINANZA ----------
   Se un giocatore e migliore o uguale a un altro SIA per certezza SIA per resa, non puo essere
   classificato sotto di lui. E' la proprieta che il bug del riferimento 6.0 violava in massa. */
console.log('\n1. DOMINANZA — chi e migliore in entrambe le dimensioni deve stare davanti');
for (const r of ['P', 'D', 'C', 'A']) {
  const gg = perRuolo(r).filter(p => M.fantamediaAttesa(p) != null).slice(0, 120);
  const dati = gg.map(p => ({ id: p.id, n: p.n, c: M.certezza(p.id), fm: M.fantamediaAttesa(p), v: M.contributoAtteso(p.id) }));
  const violazioni = [];
  for (const a of dati) for (const b of dati) {
    if (a.id === b.id) continue;
    if (b.c >= a.c && b.fm >= a.fm && (b.c > a.c || b.fm > a.fm) && b.v < a.v) {
      violazioni.push(`${b.n} (${Math.round(b.c*100)}%, ${b.fm.toFixed(2)}) sotto ${a.n} (${Math.round(a.c*100)}%, ${a.fm.toFixed(2)})`);
    }
  }
  if (violazioni.length) ko(`ruolo ${r}: ${violazioni.length} coppie violate`, violazioni.slice(0, 3));
  else ok(`ruolo ${r}: nessuna violazione su ${dati.length} giocatori`);
}

/* ---------- 2. IL PORTIERE PIU SICURO ----------
   Fra portieri di pari bravura, quello dato titolare deve giocare. */
console.log('\n2. SCELTA DEL PORTIERE — a parita di bravura vince chi gioca');
{
  const conProb = perRuolo('P').map(p => ({ p, g: PROB.giocatori[p.id] })).filter(x => x.g);
  const tit = conProb.find(x => x.g.titolare && x.g.pct >= 85);
  const ris = conProb.filter(x => !x.g.titolare && x.g.pct <= 20).slice(0, 2);
  if (!tit || ris.length < 2) { ok('(dati insufficienti per la prova)'); }
  else {
    S.rosa = [tit.p.id, ris[0].p.id, ris[1].p.id]
      .concat(perRuolo('D').slice(0, 8).map(p => p.id))
      .concat(perRuolo('C').slice(0, 8).map(p => p.id))
      .concat(perRuolo('A').slice(0, 6).map(p => p.id));
    const u = M.scegliUndici('4-3-3');
    const inPorta = u.titolari.find(id => M.LIS[id].r === 'P');
    if (inPorta === tit.p.id) ok(`in porta ${M.LIS[inPorta].n} (dato al ${tit.g.pct}%), non le riserve al ${ris[0].g.pct}%`);
    else ko(`in porta ${M.LIS[inPorta].n} invece di ${tit.p.n} (${tit.g.pct}%)`);
  }
}

/* ---------- 3. MONOTONIA NELLA CERTEZZA ----------
   Alzare la probabilita che uno giochi non puo mai peggiorare la sua posizione. */
console.log('\n3. MONOTONIA — piu e probabile che giochi, meglio deve essere classificato');
{
  const campione = LISTONE.filter(p => M.fantamediaAttesa(p) != null).slice(0, 60);
  const violazioni = [];
  for (const p of campione) {
    S.override = {}; S.override[p.id] = 0.2; const basso = M.contributoAtteso(p.id);
    S.override[p.id] = 0.9; const alto = M.contributoAtteso(p.id);
    if (alto < basso) violazioni.push(`${p.n} (${p.r}): al 90% vale ${alto.toFixed(2)}, al 20% vale ${basso.toFixed(2)}`);
  }
  S.override = {};
  if (violazioni.length) ko(`${violazioni.length} giocatori peggiorano alzando la certezza`, violazioni.slice(0, 3));
  else ok(`nessuna inversione su ${campione.length} giocatori`);
}

/* ---------- 4. I TETTI TENGONO ----------
   Un infortunato o un non convocato non puo risalire sopra il suo tetto. */
console.log('\n4. TETTI — infortunati e non convocati non risalgono');
{
  const infortunati = Object.values(PROB.indisponibili).filter(x => x.tipo === 'infortunato');
  S.override = {};
  const sopra = infortunati.map(x => ({ x, c: M.certezza(x.id) })).filter(y => y.c > 0.13);
  if (sopra.length) ko(`${sopra.length} infortunati sopra il tetto del 12%`,
    sopra.slice(0, 3).map(y => `id ${y.x.id}: ${Math.round(y.c * 100)}%`));
  else ok(`tutti e ${infortunati.length} gli infortunati sotto il 13%`);

  const squalificati = Object.values(PROB.indisponibili).filter(x => x.tipo === 'squalificato');
  const sq = squalificati.filter(x => M.certezza(x.id) > 0);
  if (sq.length) ko(`${sq.length} squalificati con certezza > 0`);
  else ok(`squalificati a zero (${squalificati.length} nel file)`);
}

/* ---------- 5. L'UNDICI E COMPLETO E COERENTE ---------- */
console.log('\n5. FORMAZIONE — struttura corretta in tutti i moduli');
{
  S.rosa = ['P', 'D', 'C', 'A'].flatMap(r => perRuolo(r).slice(0, { P: 3, D: 8, C: 8, A: 6 }[r]).map(p => p.id));
  S.bloccati = {}; S.override = {};
  let tutteOk = true;
  for (const mod of Object.keys(M.classificaModuli ? { '3-4-3': 1, '3-5-2': 1, '4-3-3': 1, '4-4-2': 1, '4-5-1': 1, '5-3-2': 1, '5-4-1': 1 } : {})) {
    const u = M.scegliUndici(mod);
    const conta = {}; ROLE_conta(u.titolari, conta);
    const atteso = { P: 1 }; const [d, c, a] = mod.split('-').map(Number);
    atteso.D = d; atteso.C = c; atteso.A = a;
    const errori = Object.keys(atteso).filter(r => (conta[r] || 0) !== atteso[r]);
    const doppioni = u.titolari.filter(id => u.panchina.includes(id));
    if (errori.length || doppioni.length || u.titolari.length !== 11) {
      tutteOk = false;
      ko(`${mod}: ${u.titolari.length} titolari, reparti sbagliati ${errori.join(',')}, doppioni ${doppioni.length}`);
    }
  }
  function ROLE_conta(ids, out) { ids.forEach(id => { const r = M.LIS[id].r; out[r] = (out[r] || 0) + 1; }); }
  if (tutteOk) ok('tutti e 7 i moduli: 11 titolari, reparti giusti, nessun doppione fra campo e panchina');
}

/* ---------- 6. LA REGOLA DEI CAMBI ----------
   I sostituti entrano scorrendo la PANCHINA nell'ordine, ognuno solo se in campo manca
   qualcuno del suo ruolo, al massimo tre. Si verifica facendo mancare piu titolari di quanti
   cambi siano concessi: e li che una regola sbagliata sceglie sostituti diversi. */
console.log('');
console.log('6. CAMBI — si scorre la panchina, stesso ruolo, massimo tre');
{
  S.rosa = ['P','D','C','A'].flatMap(r => perRuolo(r).slice(0, {P:3,D:8,C:8,A:6}[r]).map(p => p.id));
  S.bloccati = {}; S.override = {};

  const u = M.scegliUndici('4-3-3');

  /* L'undici va FISSATO prima di azzerare, altrimenti scegliUndici sostituisce i giocatori
     azzerati gia in fase di scelta e non si finisce mai per provare la regola dei cambi. */
  S.bloccati = {};
  u.titolari.forEach(id => { S.bloccati[id] = true; });

  /* Cinque titolari non prendono voto: i mancanti saranno piu dei tre cambi concessi. */
  u.titolari.slice(0, 5).forEach(id => { S.override[id] = 0; });
  /* Panchina tutta certa, cosi l'unico limite che resta e la regola dei cambi. */
  u.panchina.forEach(id => { S.override[id] = 1; });

  const u2 = M.scegliUndici('4-3-3');
  const v = M.valuta(u2.titolari, u2.panchina);
  const inCampo = 11 - v.buchiAttesi;
  const attesi = 11 - 5 + 3;   // ne mancano 5, se ne recuperano al massimo 3

  /* Il recupero puo essere minore di 3 se i mancanti sono concentrati in un ruolo con pochi
     panchinari di quel ruolo: quindi si controlla che NON si superi mai il tetto, e che
     qualche cambio avvenga davvero. */
  if (inCampo > attesi + 0.05) {
    ko('in campo restano ' + inCampo.toFixed(2) + ': superato il tetto di 3 cambi');
  } else if (inCampo < 11 - 5 - 0.05) {
    ko('in campo restano ' + inCampo.toFixed(2) + ': nessun cambio effettuato');
  } else {
    ok('con 5 titolari fuori restano ' + inCampo.toFixed(1) + ' in campo (fra 6 e ' + attesi + ', tetto rispettato)');
  }
  S.bloccati = {};
  S.override = {};
}

console.log('\n' + (falliti ? falliti + ' PROVE FALLITE' : 'Tutte le invarianti rispettate.') + '\n');
process.exit(falliti ? 1 : 0);
