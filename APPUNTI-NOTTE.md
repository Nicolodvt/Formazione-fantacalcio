# Appunti della notte 03→04/09/2026

File di lavoro, non documentazione. Serve a ritrovare il filo dopo ogni risveglio.
A fine notte va riassunto in CLAUDE.md e cancellato.

## Stato lista

- [x] 1. QA via click UI reali — FATTO, 1 bug trovato (bersagli da dito) e corretto
- [x] 2. Casi limite — FATTO, tutti gestiti senza errori
- [x] 3. netlify.toml — FATTO
- [x] 4. Ricerca fonti dati — FATTO (vedi sotto)
- [x] 5. Esplorazione grafica — FATTO, branch grafica-varianti, 3 varianti + pagina di confronto
- [x] 6. Scaffolding scraper voti — FATTO e validato su G1+G2
- [x] 7. Sanity check fantamedia — FATTO: scala confermata dai dati veri
- [x] 8. Feature e fix — FATTO: rendimento reale, avversario sul campo, 11 bug corretti
- [x] 9. Verifica con subagent — FATTO, 2 revisori, 11 bug trovati e corretti
- [ ] 10. Memoria aggiornata

## Diario

### 23:56 — partenza
Reti di sicurezza armate: cron one-shot 04:03 (reset limiti utente) + watchdog orario :47.
Stato git di partenza: ff4b028 "Campo elastico, avviso dati vecchi, diario aggiornato".
Remote su origin/main, Netlify pubblica e verificata.

### 23:59 — punti 1, 2, 3 chiusi

**QA interfaccia.** Il pannello browser resta nascosto tutta la notte, quindi i click veri del
mouse vanno in timeout. Aggirato cosi: il wiring verificato con click DOM sui listener, e la parte
che sarebbe sfuggita (elementi coperti, bersagli troppo piccoli) misurata con elementFromPoint.
E stato proprio quel test geometrico a trovare l'unico bug vero della serata.

Flussi verificati, tutti a posto: import (testo non-JSON, schema sbagliato, import buono),
correzioni a mano (Gioca/Dubbio/Fuori/Auto), fissaggio e cambio slot con ripristino, componi a
mano (ricerca, reparto pieno rifiutato, rimozione), impostazioni (reset correzioni, testo
formazione da copiare).

**Casi limite**, nessun errore JavaScript in nessuno:
- rosa vuota: schermata iniziale corretta in tutte e tre le viste
- un solo giocatore: 10 caselle vuote, modificatore assente
- zero portieri: casella "manca", modificatore assente
- 11 esatti senza panchina: avvisa che il modificatore salta il 25% delle volte, non avendo sostituti
- niente attaccanti: l'ottimizzatore mette in cima 5-4-1 e 4-5-1, cioe i moduli che sprecano meno
  caselle vuote. Comportamento sensato emerso da solo dalla simulazione, non programmato a mano.

**netlify.toml**: no-cache su sw.js (con Service-Worker-Allowed), index.html, manifest e dati/*.
Il rischio evitato e il piu insidioso delle PWA: un CDN che serve un service worker vecchio e
un'app che non si aggiorna mai piu, senza che l'utente possa accorgersene.

### 00:05 — punti 4 e 6: fonti dati e scraper voti

**Cosa e raggiungibile senza login** (sondato lato server):

| fonte | esito |
|---|---|
| voti di giornata | pubblica, servita dal server, 319 giocatori — USABILE |
| statistiche stagionali | pubblica, 592 giocatori — la fonte per le medie voto reali |
| infortunati | pubblica, ma NON usa i link con id: struttura da capire |
| squalificati | pubblica, 45 KB, nessuna tabella: forse vuota o caricata via JS |
| calendario | pubblica, ma mostra solo la giornata corrente |
| API /api/v1/Excel/votes | 401, serve account. NON usata: non serve |

**Scraper voti fatto** (`tools/fetch-voti.mjs`), validato su G1 e G2: 293 voti per giornata,
media 5.98 e 5.96 — esattamente il valore atteso per il calcio. Incrocio col listone: 95-98%
agganciati, ZERO discordanze di ruolo.

Due trappole trovate e disinnescate, nessuna delle quali dava errore:

1. **Tre colonne di voto, non una.** Il sito pubblica Redazione Fantacalcio, Voto Statistico e
   Voto Italia affiancate. La nostra lega usa la PRIMA. Prendere la colonna sbagliata non
   avrebbe dato alcun errore, solo uno storico interamente falso. Lo script ora verifica
   l'ordine leggendo le icone di intestazione e si ferma se cambia.
2. **"Senza voto" e codificato come 55.** Non come casella vuota. Preso per buono dava una media
   di giornata di 9.98, impossibile. Verificato che tutte e 28 le righe con 55 portano l'icona
   "Subentrato": sono entrati troppo tardi per essere giudicati. E stata la validazione sulla
   media a intercettarlo — senza, sarebbe passato in silenzio.

### 00:15 — punto 7: taratura sui dati veri

`tools/taratura.mjs` estrae le formule DA index.html (non le ricopia, cosi le due versioni non
possono divergere) e le confronta con i fantavoti realmente ottenuti in G1+G2. 331 giocatori.

**La scala e giusta**, che era la domanda vera:

| ruolo | n | stima | reale | scarto |
|---|---|---|---|---|
| P | 20 | 4.61 | 4.78 | -0.17 |
| D | 119 | 5.99 | 5.99 | -0.00 |
| C | 137 | 6.30 | 6.29 | +0.01 |
| A | 55 | 6.54 | 6.57 | -0.03 |
| **totale** | 331 | **6.13** | **6.14** | **-0.01** |

Le costanti BONUS_MAX erano state scelte a intuito e reggono al confronto coi dati veri.

**Sull'ordine non si puo concludere** con due giornate: Spearman 0.32 complessivo (P 0.57,
D 0.31, C 0.22, A 0.32). Gli scarti maggiori sono varianza pura, non errore di modello: Malen
stimato 7.57 e reale 15.50 vuol dire doppietta, De Gea stimato 4.64 e reale 1.75 vuol dire tre
gol subiti. NON ho toccato le costanti sulla base di due partite: sarebbe inseguire il rumore.

Da rifare dopo G5 e G10, quando il campione comincia a dire qualcosa sull'ordinamento.

### 00:40 — punto 5: tre varianti grafiche

**Sul Figma.** L'utente ha chiesto di rifare la grafica col connettore Figma. Il CLAUDE.md
dell'app asta documenta pero che era gia stato provato e scartato su questo progetto: serve a
implementare un design che esiste gia come file Figma, non a inventarne uno partendo da
"rendilo bello". Con l'utente che dorme e nessuna direzione data (palette, riferimenti), un
redesign totale alla cieca sarebbe stato lavoro da buttare — e l'intervento a raggio piu ampio
di tutti. Quindi niente generazione cieca: tre direzioni concrete, reversibili, su branch.

Branch `grafica-varianti` (main MAI toccato), quattro app affiancate in
`confronto-grafica.html` a 375px, interattive e non immagini:

- **A "Campo vero"** — il campo diventa un campo (righe d'erba, bordo, cerchio di centrocampo);
  le caselle diventano tessere chiare che si staccano, invece di riquadri scuri su verde scuro.
- **B "Chiara"** — tema chiaro. Motivazione pratica, non estetica: la formazione si fa il sabato
  mattina e uno schermo scuro al sole e uno specchio. Il campo resta verde.
- **C "Densa"** — resta scura ma si stringe; KPI in una riga sola invece di tre scatole;
  ~2 giocatori in piu per schermata.

I colori di ruolo non cambiano in nessuna (nella B solo scuriti per il fondo chiaro).

Le varianti sono mescolabili: toccano regole diverse, quindi il campo della A puo convivere
con la densita della C.

### 03:17 — punto 9: due revisori indipendenti, undici bug corretti

Il giro con i subagent e stato il piu redditizio della notte. Sintesi.

**Nel motore (index.html):**
1. **contributoAtteso invertiva la certezza.** Sottraeva 6.0 come riferimento, quindi per chi ha
   fantamedia sotto 6 (TUTTI i portieri, meta dei difensori) una certezza piu alta rendeva il
   punteggio piu negativo: l'app preferiva chi NON gioca. Riprodotto: con Svilar al 90% e due
   riserve al 5%, mandava in porta una riserva. Il criterio giusto discende da simula(), dove
   chi resta senza voto vale ZERO e non 6: quindi certezza x fantamedia.
   I miei test non l'avevano visto perche i tre portieri di prova erano tutti al 90%: a certezza
   costante l'ordinamento tornava giusto per caso.
2. **Il subentro annullava i tetti** su infortunati e non convocati, sommandosi dopo: tutti e 42
   gli infortunati uscivano identici al 19,6%.
3. **I cambi si scorrevano dai titolari mancanti** invece che dalla panchina, che e la regola
   vera — e l'ordine di panchina e proprio quello che l'app fa ricopiare sul sito della lega.
4. **La panchina non pesava se un cambio serve** in quel ruolo.
5. **I fissati eccedenti** venivano troncati in ordine di inserimento in rosa.
6. **Dati mutilati = pagina bianca**, e la cache non era validata affatto.
7. **Squadra fuori dal turno** -> certezza fino al 100% senza avviso.

**Negli scraper:**
8. **Ammonizioni buttate**: sono una classe sul voto, non un bonus. Senza, i bonus non potevano
   spiegare il fantavoto (31 scarti su 293, tutti da -0.5).
9. **Riconciliazione mancante**: ora si ricostruisce fantavoto = voto + bonus + ammonizione. I
   pesi sono ricavati dai dati (262 + 31 = 293, zero non spiegati), non dati per scontati.
10. **L'ordine delle colonne di voto** era verificato solo sulla prima tabella su venti.
11. Unicita squadre, soglie su indisponibili/ballottaggi/percentuali/panchine, matchweek
    concordi, timeout, HTML troncato, ancoraggio del nome squadra, marcatori fragili.

**Lezione**: i miei test passavano tutti perche usavano una rosa "sana", con valori uniformi.
Il bug numero 1 esisteva solo quando le certezze DIFFERISCONO fra loro. Le prove vanno fatte su
dati che variano, non su dati comodi.

**Limite accettato e dichiarato**: se il sito riordinasse le celle dei voti lasciando ferme le
intestazioni, nessun controllo sul contenuto potrebbe accorgersene, perche ogni colonna e
internamente coerente. E il prezzo della lettura per posizione.

**Domanda aperta per l'utente**: dove va il portiere di riserva in panchina dipende dal
regolamento — in molte leghe il cambio del portiere non consuma i tre cambi di movimento. Non
l'ho indovinato.

### 03:32 — chiusura

**Tutti e dieci i punti chiusi.** `main` pushato, Netlify ha ridistribuito, verificato che online
ci sia il codice corretto e che gli header di cache siano attivi (non supposti: controllati con
una HEAD su ogni file).

**Feature aggiunte oltre alla lista:**
- Il **rendimento reale** nella scheda giocatore: quanto ha reso davvero nelle giornate giocate,
  accanto alla stima. Lo scarto si mostra solo da 4 giornate in su, perche su 2 partite Malen
  esce con +8 di scarto (ha segnato molto) e sembrerebbe che il modello sia rotto.
- Sul campo si legge **contro chi gioca** ("@JUV") invece della propria squadra, che gia sai.
- La Action scarica anche i **voti** il martedi sera.

**`tools/prova-motore.mjs`**: prove sulle INVARIANTI, non su casi particolari. Dominanza,
monotonia, scelta del portiere, tetti, struttura dell'undici, regola dei cambi. Verificato che
FALLISCE se si reintroduce il bug del riferimento 6.0 (803 coppie violate fra i portieri): una
prova che non fallisce quando deve non e una prova.

**Cosa resta all'utente, in ordine:**
1. Aprire `confronto-grafica.html` sul branch `grafica-varianti` e scegliere (o scartare tutto).
2. Dire il regolamento della lega, in particolare **se il cambio del portiere consuma uno dei
   tre cambi di movimento**: da questo dipende dove va messo il secondo portiere in panchina, e
   non l'ho indovinato.
3. Lanciare la Action a mano da GitHub per vederla girare, se non vuole aspettare venerdi.

**Questo file va riassunto in CLAUDE.md e cancellato** una volta che l'utente l'ha letto: le
parti che valgono oltre stanotte sono gia state travasate.
