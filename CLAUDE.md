# App Formazione — Diario di bordo

**Stato: v0.5 (15/09/2026) — ONLINE E IN USO, 5ª giornata.** Pubblicata su Netlify (build vera via
GitHub, non drag&drop: serve per `@netlify/blobs` in `netlify/functions/schierato.mjs`), rosa vera
importata, app installata sul telefono, notifiche push attive (secret e variable impostati su
GitHub). `main` e `dev` sono allineati. L'app schiera, sceglie il modulo, funziona offline, e la
stima si mescola da sola con i voti veri (singolo giocatore, ruolo, squadra intera). Countdown e
promemoria scaglionati su una scadenza vera. La GitHub Action scarica probabili e voti da sola, con
una fonte di riserva se la prima fallisce.

Progetto separato dall'app asta (cartella superiore): quella serve a *comprare* ed è finita;
questa serve a *schierare* e deve reggere 38 giornate.

**Per il perché dietro ogni scelta, la cronologia completa e gli incidenti già risolti**: vedi
[DIARIO-STORICO.md](DIARIO-STORICO.md). Questo file tiene solo lo stato attivo, per non doverlo
rileggere per intero a ogni sessione — se serve capire *perché* qualcosa è fatto in un certo modo
(non solo *come funziona ora*), quel file ha il ragionamento e le verifiche fatte sul campo.

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
  meno). Sopra c'è anche `RETTIFICA_RUOLO` (`tools/ricalibra.mjs`, gira in CI dopo i voti):
  corregge uno scarto sistematico *di ruolo* — non del singolo giocatore — smorzato e limitato,
  scritto in `dati/costanti.json` e letto senza bisogno di deploy.
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

## Da fare

1. **Ritarare le costanti a intuito** (`PESO_AVVERSARIO`, `CASA_BONUS`, `DECADIMENTO_FORMA` — non
   `PESO_PRIOR_STAGIONE`, l'utente ha chiesto di lasciarla) quando ci saranno abbastanza giornate.
   Con `taratura.mjs`.
2. **Usare il dettaglio gol/assist/rigori/cartellini** già salvato in `STORICO` (dal 05/09, non
   ancora usato da nessun calcolo) per tarare `BONUS_PIAZZATI`/`BONUS_MAX` sull'osservato invece
   che a intuito, quando ci saranno abbastanza giornate.
3. **Calendario storico** (chi ha giocato contro chi, dove): serve per tarare `CASA_BONUS`/
   `PESO_AVVERSARIO` sui risultati veri. Non deciso se costruirlo.
4. **xG/Understat per l'"oracolo"**: fonte buona ma bloccata da `robots.txt` (Understat
   `Disallow: /`) o da anti-bot Cloudflare (FBref) — richiederebbe ignorare un robots.txt
   dichiarato o un browser vero. **Deciso di rimandare** (05/09), non urgente.
5. Fase 4 — mercato di riparazione e svincoli.
6. **Provare sul telefono vero** i gesti (swipe fra tab, pull-to-refresh) aggiunti il 05/09:
   verificati solo con eventi sintetici in emulazione.
7. **Proposto ma non richiesto**: un bottone "esporta rosa attuale" in Impostazioni, utile per
   analisi come quella della *rosa dell'utente* sopra senza doverla riscrivere a mano.

**Aperto, non bloccante**: regolamento della lega non del tutto noto (moduli ammessi, numero di
cambi, soglie del modificatore, se il cambio portiere consuma un cambio di movimento). Si è
partiti con i default in testa al file, sotto *COSTANTI DI LEGA*.

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
sostanziale — dettagli/cronologia completa vanno in DIARIO-STORICO.md, qui resta solo stato e
lavoro attivo.
