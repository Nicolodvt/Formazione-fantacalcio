/* Stampa "true" o "false" su stdout: la prossima giornata nota (l'ultimo dati/probabili.json
   scaricato) e' un turno infrasettimanale? Usato dal giro extra del martedi in
   .github/workflows/dati.yml per decidere se vale la pena controllare fantacalcio.it un'altra
   volta quell'ora, o se si puo' saltare senza disturbare nessuno. Legge solo il file gia' sul
   disco: non scarica nulla da solo, la lettura vera la fa "Probabili formazioni" a monte. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { infrasettimanale } from './calendario.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FILE_PROB = join(QUI, '..', 'dati', 'probabili.json');

function leggi() {
  try { return JSON.parse(readFileSync(FILE_PROB, 'utf8')); }
  catch (e) { return null; }
}

const prob = leggi();
console.log(prob ? infrasettimanale(prob) : false);
