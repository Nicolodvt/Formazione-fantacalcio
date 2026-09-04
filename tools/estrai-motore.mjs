/* Estrae dal sorgente di index.html la parte PURA del motore (fantamediaStimata, mvPura,
   MV_SQUADRA) e la esegue in un ambiente minimo ricostruito qui. Condivisa da taratura.mjs
   e ricalibra.mjs: prima ciascuno ricostruiva lo stesso ambiente per conto suo, con il rischio
   che una modifica a index.html ne aggiornasse uno e non l'altro senza che nessuno se ne
   accorgesse.

   Espone solo il motore PURO (senza alcun dato reale dentro, ne del singolo giocatore ne del
   ruolo) apposta: e' l'unica versione che ha senso confrontare con l'esito vero senza cadere
   in un confronto circolare. Vedi la nota in taratura.mjs e in ricalibra.mjs. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function pezzo(script, nome, tipo = 'function') {
  const re = tipo === 'function'
    ? new RegExp('^function ' + nome + '\\([\\s\\S]*?\\n\\}', 'm')
    : new RegExp('^const ' + nome + ' = [\\s\\S]*?;', 'm');
  const m = re.exec(script);
  if (!m) throw new Error('non trovato nel sorgente: ' + nome);
  return m[0];
}

export function motorePuro(radice) {
  const html = readFileSync(resolve(radice, 'index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const LISTONE = JSON.parse(/<script id="listone-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  const p = (nome, tipo) => pezzo(script, nome, tipo);

  const sorgente = [
    'const MV_MIN = 5.75, MV_MAX = 6.15, MV_AGG_MAX = 0.12;',
    'let MV_SQUADRA_PURA = {};',
    'let ATT_SQUADRA_PURA = {};',
    p('MV_ZONA', 'const'),
    p('BONUS_MAX', 'const'),
    p('BONUS_CURVA', 'const'),
    p('BONUS_PIAZZATI', 'const'),
    p('MALUS_FISSO', 'const'),
    p('normalizzaSquadre'),
    p('calcolaMvSquadre'),
    p('mvPura'),
    p('golSubitiAttesi'),
    p('fantamediaStimata'),
    'calcolaMvSquadre();',
    'return { fantamediaStimata, mvPura, MV_SQUADRA: MV_SQUADRA_PURA };'
  ].join('\n\n');

  const motore = new Function('LISTONE', sorgente)(LISTONE);
  return { motore, LISTONE };
}
