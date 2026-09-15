# App Formazione — Diario di bordo

Progetto separato dall'app asta (cartella superiore): quella serve a *comprare* ed è finita;
questa serve a *schierare* e deve reggere 38 giornate.

**Per il perché dietro ogni scelta, la cronologia completa e gli incidenti già risolti**: vedi
[DIARIO-STORICO.md](DIARIO-STORICO.md). Le quattro sezioni sotto invece **si riscrivono**, non si
accodano: fotografano il punto in cui siamo adesso, non l'elenco di tutto quello che è successo.

## Stato attuale

**v0.5 — ONLINE E IN USO, 5ª giornata.** Pubblicata su Netlify (build vera via GitHub, non
drag&drop: serve per `@netlify/blobs` in `netlify/functions/schierato.mjs`), rosa vera importata,
app installata sul telefono, notifiche push attive. L'app schiera, sceglie il modulo, funziona
offline, e la stima si mescola da sola con i voti veri (singolo giocatore, ruolo, piazzati,
squadra intera). Countdown e promemoria scaglionati su una scadenza vera. La GitHub Action
scarica probabili e voti da sola, con una fonte di riserva se la prima fallisce.

**Rami**: `main` ha solo il fix dell'Action del 15/09 (`!cancelled()`). `dev` è avanti —
indicatore "in forma"/"in calo", fix di concorrenza in `caricaStorico()`, `RETTIFICA_PIAZZATI`, e
da questa sessione anche il fix ai promemoria scaglionati e una ricalibrazione aggiornata — **tutto
pronto in locale, non ancora pushato né mergiato su `main`**, fermato apposta un passo prima del
push su richiesta esplicita dell'utente. Nessun rischio Netlify nel frattempo: solo un merge su
`main` fa scattare un deploy, e solo se il diff tocca qualcosa oltre `dati/**`/`*.md` (vedi
*Regola di lavoro* sotto). **Il passo che resta è solo dell'utente**: dire quando pushare `dev` e
se/quando mergiare su `main` — nessun push o merge parte da solo.

## Cosa abbiamo deciso il 15/09/2026

- L'utente ha segnalato una formazione "scandalosamente sbagliata" in una giornata passata.
  Diagnosi fatta **filtrando sulla sua rosa vera**, non su tutto il listone (prima ipotesi,
  sbagliata: Malen, che l'utente non possiede). Trovato il caso vero: Frattesi, sottostimato per
  una striscia di forma che nessuna stima da quotazioni può prevedere.
- **`PESO_PRIOR_STAGIONE` resta intoccato**, richiesta esplicita dell'utente — non è quella la
  leva da usare per casi come Frattesi.
- Costruito invece: l'indicatore **"in forma"/"in calo"** (trasparenza pura, non cambia la stima)
  e **`RETTIFICA_PIAZZATI`** (calibra il bonus dei rigoristi sui gol/rigori VERI, non a intuito —
  l'unica parte isolabile del dettaglio gol/assist/rigori già salvato).
- Trovato e risolto, costruendo l'indicatore: un bug di concorrenza in `caricaStorico()`
  (chiamate sovrapposte duplicavano le giornate nello storico).
- Indagata e risolta l'email "All jobs have failed": un fallimento delle probabili faceva saltare
  a cascata anche voti/ricalibrazione/promemoria per un gate implicito di GitHub Actions — fix
  già su `main`.
- Snellito il diario (87KB → 11KB), cronologia spostata in DIARIO-STORICO.md.
- **Principio dato dall'utente**: il campionato è iniziato, non si può aspettare fine stagione
  per un vantaggio reale — un miglioramento isolabile e sicuro (soglia di campione, correzione
  limitata e smorzata) va implementato subito, non rimandato per principio.
- **Notifiche push scaglionate: trovato e risolto un bug che le azzerava tutte.** Il cron
  dell'Action (`*/15 * * * *` dichiarato) arriva in pratica con gap reali di 2-6 ore (verificato
  sulle esecuzioni vere via API pubblica GitHub). La soglia di tolleranza di 20 minuti nel codice
  scartava quindi ogni promemoria come "troppo in ritardo": per la giornata 4 tutti e sei i
  promemoria scaglionati risultano `"saltata"` in `dati/scadenza-promemoria.json`, nessuno
  spedito. **Fix** in `tools/promemoria-scadenza.mjs`: ora si rinuncia solo se la scadenza vera è
  già passata, e il testo del promemoria riporta il tempo REALE rimasto invece dell'etichetta
  nominale della soglia. Dettagli in DIARIO-STORICO.md. Da verificare sul campo alla scadenza
  della giornata 5 (18/09).
- **Ricalibrazione (`RETTIFICA_RUOLO`/`RETTIFICA_PIAZZATI`) rilanciata a mano** su richiesta,
  pur girando già da sola in CI dopo ogni giornata conclusa. Nota di trasparenza: essendo un
  aggiornamento smorzato che parte dal valore precedente, rilanciarla senza nuovi voti nel mezzo
  la fa convergere un po' più vicino all'obiettivo di quanto avrebbe fatto un solo giro
  automatico — resta comunque dentro i limiti di sicurezza (`MIN_CAMPIONE`/`LIMITE` in
  `tools/ricalibra.mjs`). Non serve più rilanciarla a mano: la prossima ricalibrazione vera
  arriva da sola con i voti della giornata 5.
- **Attrito permessi Bash risolto**: `settingslocaljson.txt` spostato in
  `.claude/settings.local.json` (già in `.gitignore`, locale non versionato).
- **Bottone "esporta rosa attuale" tolto dai piani**: proposto il 15/09, l'utente ha detto di non
  volerlo. Non è più nei *Prossimi passi*.

## La rosa dell'utente (15/09/2026)

Scritta a mano dall'utente, nomi verificati contro il listone (`index.html`, `listone-data`) per
usare la grafia esatta — utile per qualunque analisi futura filtrata sulla sua rosa invece che su
tutto il listone. **Da aggiornare solo al mercato** (svincoli/acquisti), non ad ogni sessione.

- **P (3)**: Falcone (Lecce), Okoye (Udinese), Skorupski (Bologna)
- **D (8)**: Bisseck (Inter), Comuzzo (Torino), Delprato (Parma), Di Lorenzo (Napoli), Idzes
  (Sassuolo), Marusic (Lazio), Spence (Inter), Spinazzola (Napoli)
- **C (8)**: Frattesi (Lazio), Paz N. — Nico Paz (Como), Politano (Napoli), Vergara (Napoli),
  Vlasic (Torino), Winks (Cagliari), Zambo Anguissa (Napoli), Zaniolo (Udinese)
- **A (6)**: Berardi (Sassuolo), Davis K. (Udinese), Esposito F.P. — Pio Esposito (Inter), Kean
  (Como), Laurientè (Sassuolo), Raspadori (Atalanta)

Non c'è ancora un export automatico dall'app stessa (solo l'import una tantum dallo schema
dell'app asta) — se serve spesso vale la pena aggiungerlo.

## ⚠️ Regola di lavoro corrente: si sviluppa su `dev`, non su `main`

**Dal 04/09/2026, dopo l'incidente dei crediti Netlify** (una notte di lavoro autonomo ha
bruciato 150 crediti Netlify con push ripetuti su `main`). Finché non viene tolta esplicitamente:

- Si lavora **sempre su branch `dev`**, mai commit diretti su `main`.
- Push su `dev` liberamente; **mai** mergiare `dev` → `main`, **mai** riattivare i build Netlify,
  **mai** `netlify deploy`/login/config, **mai** push su `main` — senza che l'utente lo chieda
  esplicitamente *in quella sessione*. Un'autorizzazione data prima non vale più dopo questa nota.
- Eccezione già in vigore: i commit **solo-dati** della GitHub Action (`dati/*.json`) vanno
  direttamente su `main` come sempre hanno fatto — `netlify.toml` li esclude dal trigger di build
  (`ignore` su `dati/**` e `*.md`), quindi non consumano crediti. La regola riguarda il codice.

## Architettura in breve

- **Single-file** (`index.html`): CSS in `<style>`, listone in `<script id="listone-data">`,
  logica in un unico IIFE, zero dipendenze esterne per l'app stessa.
- **fantacalcio.it non manda header CORS** → il browser non può chiamarlo. Per questo una
  GitHub Action scarica probabili/voti e li committa in `dati/*.json`; l'app li legge prima
  **direttamente da GitHub** (gratis, istantaneo), poi ripiega sulla copia locale pubblicata con
  l'app. Zero credenziali nel browser, offline funziona (il service worker cachea anche i dati),
  e se il fetcher muore l'app continua con l'ultimo dato buono dichiarandone la data.
  Dettagli/verifiche in DIARIO-STORICO.md → *La decisione che regge tutto*.
- **Perché i dati non passano da un deploy Netlify**: la Action scrive su `dati/` fino a 7
  volte a settimana; un deploy a ogni scrittura pubblicherebbe il sito altrettante volte. Vedi
  *Regola di lavoro* sopra per come si evita.
- Gli `id` dei giocatori sono gli stessi id di fantacalcio.it (verificato, mai si incrociano i
  nomi — troppo ambigui, es. "Martinez L." per due giocatori diversi).

## Come funziona il motore

**La parte dell'app che conta di più** — priorità dichiarata dall'utente sopra ogni altra cosa.
Tre grandezze tenute separate fino alla fine (un fuoriclasse al 20% non è un fuoriclasse quella
domenica): `contributoAtteso = certezza × (resa + prossima_partita)`.

- **certezza** (`certezza()`) — probabilità di prendere voto: percentuale delle probabili,
  corretta da squalifiche/infortuni/dubbi e da quanto il giocatore è entrato dalla panchina di
  recente nonostante fosse titolare sulla carta.
- **resa** (`fantamediaAttesa()`) — quanto vale IN MEDIA quando gioca. Stima pura da quotazioni
  (`fantamediaStimata()`, mai contaminata da dati reali — serve da prior e da termine di
  paragone onesto), mescolata (`mescola()`, prior→dati con `PESO_PRIOR_STAGIONE=10`) con
  l'andamento reale pesato per recenza (`DECADIMENTO_FORMA=0.85`, giornate vecchie contano
  meno). Sopra ci sono due correzioni gemelle, stesso schema (soglia di campione, limite,
  smorzamento — `tools/ricalibra.mjs`, gira in CI dopo i voti, scritte in `dati/costanti.json`,
  lette senza deploy): `RETTIFICA_RUOLO` per uno scarto sistematico *di ruolo*, e
  `RETTIFICA_PIAZZATI` (15/09) per il bonus dei rigoristi (`R1`/`R2`/`R3`), tarata sui gol/rigori
  VERI del giocatore invece che a intuito — le punizioni (`P1`/`P2`/`P3`) restano a intuito,
  nei dati scaricati un gol su punizione non si distingue da uno normale.
- **prossima partita** (`rettificaPartita()`) — fattore campo (`CASA_BONUS=0.08`) + forza
  dell'avversario nel reparto che conta (`MV_SQUADRA`/`ATT_SQUADRA`, anche queste mescolate con
  il rendimento reale delle squadre, non ferme alle quotazioni di agosto). Sommata, non
  moltiplicata: un forte contro un forte resta forte.

Tutte le costanti sopra sono **dichiarate a intuito**, non ancora tarate su abbastanza giornate
(vedi *Da fare*). `PESO_PRIOR_STAGIONE` in particolare: l'utente ha chiesto esplicitamente di
NON toccarla (15/09) — è il motivo per cui un giocatore in striscia di forma (es. un gol a
partita per 3 giornate) viene riconosciuto solo gradualmente, non subito. Il segnale
"in forma"/"in calo" (freccia verde/rossa vicino alla fantamedia, in Rosa e Campo) esiste apposta
per questo: non cambia la stima, avvisa quando conviene fidarsi del proprio giudizio.

**Il modulo si sceglie per simulazione** (`simula()`, `N_SIM=1500`), non a tavolino: il
modificatore di difesa non è additivo (portiere + 3 *migliori* difensori), quindi un conto
lineare sceglierebbe sempre la difesa a 3. La simulazione dice anche quanto spesso il
modificatore salta del tutto (difesa fragile → "salta X% delle volte", non "forte").

## File

- `index.html` — l'app.
- `manifest.webmanifest` + `sw.js` — installazione e offline (via http/https, non `file://`).
- `tools/fetch-probabili.mjs` — scraper principale, **gira solo in CI**. `tools/fetch-probabili-alt.mjs`
  — riserva, solo se il principale fallisce (fantacalcio-online.com, aggancio per cognome).
- `tools/fetch-voti.mjs` — voti a giornata conclusa.
- `dati/probabili.json`, `dati/voti-N.json`, `dati/costanti.json` — output degli scraper/di
  `ricalibra.mjs`, letti da `fetchDati()` (GitHub diretto, poi same-origin).
- `.github/workflows/dati.yml` — il cron (vedi commento in testa al file per gli orari esatti).
  I passi voti/ricalibrazione/promemoria hanno `!cancelled()`: un fallimento delle probabili non
  li salta più a cascata (fix 15/09, vedi DIARIO-STORICO.md).
- `.github/workflows/promemoria.yml` + `tools/promemoria-scadenza.mjs` — promemoria scaglionati
  verso la scadenza (24h→30min), ogni 15 minuti, non tocca fantacalcio.it.
- `tools/estrai-motore.mjs` — estrae il motore PURO da `index.html` per `taratura.mjs`/`ricalibra.mjs`,
  così le due copie non divergono mai.
- `tools/taratura.mjs` — diagnostica (stime vs voti reali), non scrive nulla.
- `tools/ricalibra.mjs` — scrive `dati/costanti.json` (vedi *Come funziona il motore*).
- `tools/controlla.mjs [ref]` — controllo di integrità, **da lanciare dopo ogni modifica**.
- `netlify/functions/schierato.mjs` — unica funzione Netlify (unica dipendenza vera,
  `package.json`/`package-lock.json`): ricorda se la giornata è già schierata.
- `tools/serve.mjs` — server statico locale su :8099. `tools/rosa-esempio.json` — rosa finta di prova.

## Prossimi passi

1. **Push/merge di `dev`**: tutto pronto in locale (fix promemoria, ricalibrazione, diario
   aggiornato) ma fermato apposta un passo prima del push su richiesta esplicita. Aspetta un via
   libera esplicito per `git push`, e separatamente per un eventuale merge su `main` (vedi
   *Regola di lavoro*).
2. **Verificare che il fix dei promemoria funzioni davvero**: prossima occasione vera è la
   scadenza della giornata 5 (prima partita venerdì 18/09 20:45) — controllare che almeno un
   promemoria scaglionato arrivi sul telefono, invece di ritrovarsi di nuovo
   `dati/scadenza-promemoria.json` pieno di `"saltata"`. Se non arriva nulla nemmeno stavolta, il
   sospetto successivo è l'abbonamento push scaduto (va ri-registrato dall'app), non il codice.
3. **Ritarare `PESO_AVVERSARIO`, `CASA_BONUS`, `DECADIMENTO_FORMA`** (non `PESO_PRIOR_STAGIONE`,
   l'utente ha chiesto di lasciarla) quando ci saranno abbastanza giornate. Con `taratura.mjs`.
   Diverso da `RETTIFICA_RUOLO`/`RETTIFICA_PIAZZATI`, che ormai si aggiornano da sole in CI a ogni
   giornata conclusa.
4. **Calendario storico** (chi ha giocato contro chi, dove) per tarare `CASA_BONUS`/
   `PESO_AVVERSARIO` sui risultati veri — rimandato (15/09), non deciso se costruirlo.
5. **Mercato di riparazione e svincoli** — a gennaio (15/09), non prima.
6. **Provare sul telefono vero** i gesti (swipe fra tab, pull-to-refresh, aggiunti il 05/09):
   verificati finora solo in emulazione/da terminale, mai il tatto/l'uso reale.

## Problemi aperti

- **`BONUS_MAX` (tetto di bonus a percentile 100 per ruolo) resta a intuito.** Fatta solo la metà
  isolabile del dettaglio gol/rigori: `RETTIFICA_PIAZZATI` sui rigoristi. Calibrare anche
  `BONUS_MAX` richiederebbe isolare il bonus "da percentile puro" (gol/assist normali, non
  rigori) — con 5 giornate e pochi giocatori al vertice del ruolo, rischia di inseguire il
  rumore. Da riprovare con più giornate o un modo migliore di isolarlo.
- **xG/Understat per l'"oracolo"**: fonte buona ma bloccata da `robots.txt` (Understat
  `Disallow: /`) o da anti-bot Cloudflare (FBref) — richiederebbe ignorare un robots.txt
  dichiarato o un browser vero. L'utente ha deciso di rimandare (05/09), non è urgente.
- **Regolamento di lega non del tutto noto** (moduli ammessi, numero di cambi, soglie del
  modificatore, se il cambio portiere consuma un cambio di movimento) — non bloccante, si è
  partiti con i default in testa al file, sotto *COSTANTI DI LEGA*.
- **Cadenza reale del cron GitHub Actions**: i gap di 2-6 ore osservati il 15/09 sul workflow
  promemoria probabilmente riguardano anche `dati.yml` (probabili/voti/ricalibrazione) — non
  verificato in dettaglio, da tenere presente se in futuro dati o promemoria sembrano arrivare
  "in ritardo" rispetto al cron dichiarato.

## Regole di lavoro (ereditate dall'app asta, imparate sbagliando)

- **Dopo ogni modifica**, oltre a `node --check`, lanciare `tools/controlla.mjs`: una
  sostituzione "da qui a lì" può cancellare interi blocchi lasciando il codice sintatticamente
  valido. Vale anche per il CSS (una regola persa non dà errore).
- **Poi guardarla davvero, a 375px** — i difetti veri sono usciti da lì, non dai controlli.
- **Non fidarsi di una validazione perché passa sui dati veri**: sabotare l'input e vedere cosa
  intercetta trova molto di più (metodo che ha scovato 11 bug reali nella revisione del 03-04/09,
  vedi DIARIO-STORICO.md).
- Commit piccoli e frequenti (qui c'è git, a differenza dell'app asta).
- Attenzione a `node -e` dentro bash: i backtick nei template literal vengono interpretati dalla
  shell. Per le patch, scrivere lo script su file ed eseguirlo.

**Aggiornamento di questo file**: lo tengo aggiornato io a fine di ogni blocco di lavoro
sostanziale. Le quattro sezioni in testa (*Stato attuale*, *Cosa abbiamo deciso*, *Prossimi
passi*, *Problemi aperti*) si **riscrivono** ogni volta, non si accodano — sono una fotografia,
non un registro. Il registro (cronologia completa, perché di ogni scelta) va in
DIARIO-STORICO.md, che invece cresce.
