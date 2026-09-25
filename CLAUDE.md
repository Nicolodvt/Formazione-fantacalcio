# App Formazione — Diario di bordo

Progetto separato dall'app asta (cartella superiore): quella serve a *comprare* ed è finita;
questa serve a *schierare* e deve reggere 38 giornate.

**Per il perché dietro ogni scelta, la cronologia completa e gli incidenti già risolti**: vedi
[DIARIO-STORICO.md](DIARIO-STORICO.md). Le quattro sezioni sotto invece **si riscrivono**, non si
accodano: fotografano il punto in cui siamo adesso, non l'elenco di tutto quello che è successo.

## Stato attuale

**v0.5 — ONLINE E IN USO.** Pubblicata su Netlify (build vera via GitHub, non drag&drop: serve per
`@netlify/blobs` in `netlify/functions/schierato.mjs`), rosa vera importata, app installata sul
telefono, notifiche push attive. L'app schiera, sceglie il modulo, funziona offline, e la stima si
mescola da sola con i voti veri (singolo giocatore, ruolo, piazzati, squadra intera). Countdown e
promemoria scaglionati su una scadenza vera. La GitHub Action scarica probabili e voti da sola,
con una fonte di riserva se la prima fallisce.

**Calendario**: giocate G1-G5 (voti tutti scaricati, ricalibrazione fatta), poi sosta per le
nazionali. **G6 il 10-12/10**, prima partita Genoa-Fiorentina sabato 10/10 alle 15:00.

**Rami (26/09)**: `dev` è avanti di 7 commit su `main`, **non ancora pushati**: i fix della
sessione del 26/09 (sotto) più un commit di diario rimasto solo in locale dal 16/09. Il merge su
`main` **fa scattare un deploy Netlify** (tocca `tools/`, `.github/` e, se tenuto, `netlify.toml`,
non solo `dati/**`/`*.md`) — serve l'autorizzazione esplicita dell'utente in sessione (vedi
*Regola di lavoro*). Finché non arriva su `main` la Action gira col codice vecchio: workflow
rosso a ogni giro, ricalibrazione ripetuta a ogni giro di lunedì/martedì, promemoria G6 in
ritardo di 2 ore.

## Cosa abbiamo trovato e deciso il 26/09/2026

Richiesta dell'utente: "ricevo mail che le Actions su GitHub sono fallite, risolvi e controlla
tutto il resto". Dettagli, numeri e metodo in DIARIO-STORICO.md → *Sessione del 26/09*.

- **Le email "failed"**: dal 21/09 `tools/fetch-probabili.mjs` bocciava ogni giro per "nessun
  ballottaggio trovato". Falso allarme: con la G6 a tre settimane (sosta) la redazione scrive
  "Nessun ballottaggio" per tutte e 20 le squadre. La fonte di riserva rimpiazzava i dati (per
  questo l'app funzionava), ma il workflow restava rosso e l'app è rimasta una settimana sui dati
  più poveri (215 giocatori invece di 484, niente moduli né panchine). **Fix**: lo zero passa
  solo se la sezione c'è in ogni partita e tutte le squadre dichiarano di non averne — provato
  con 5 sabotaggi, tutti bloccati.
- **Promemoria in ritardo di 2 ore, da sempre in CI**: `parseData()` (`tools/calendario.mjs`)
  leggeva l'orario nel fuso della macchina — giusto in locale, UTC sui runner GitHub. Alla G5 il
  "2h" è partito un'ora *dopo* il calcio d'inizio dicendo "mancano 48 minuti"; sbagliato di 2
  ore anche l'orario scritto dentro entrambe le notifiche. La simulazione col codice vecchio
  riproduce esattamente `dati/scadenza-promemoria.json` della G5. **Fix**: conversione esplicita
  da Europe/Rome, provata in 4 fusi e sui cambi d'ora. `index.html` non toccato (gira sul
  telefono, in Italia: lì è giusto).
- **Ricalibrazione ripetuta**: `dati.yml` lancia `ricalibra.mjs` a ogni giro di lunedì/martedì
  (fino a 4), e ogni lancio faceva un passo in più sugli stessi voti — correzione A 0.236 → 0.299
  in due giorni. **Fix**: esce senza scrivere se le giornate di voti sono le stesse dell'ultimo
  giro. `dati/costanti.json` rigenerato con un passo per giornata (A 0.225): il replay
  riproduce cifra per cifra i valori della CI del 04/09, 14/09 e 15/09.
- **Correzione di una nota del 16/09**: il valore tenuto allora come "primo giro pulito" su G1-G4
  (A 0.236) era già il *secondo* passo; il primo era A 0.185 (CI del 15/09 12:24). Superato: le
  costanti sono state rigenerate da zero.
- **Formula di `RETTIFICA_PIAZZATI`: trovato un difetto, NON corretto** — decisione lasciata
  all'utente (vedi *Prossimi passi*).
- **Actions su Node 24** (`checkout`/`setup-node` v6): ogni run avvisava della deprecazione di
  Node 20.
- **Facoltativo, in un commit a parte**: `netlify.toml` esclude anche `tools/**` e `.github/**`
  dal deploy (il sito non li usa). Il merge che lo porta fa comunque un deploy; da lì in poi un
  fix a script/workflow non costa più crediti.

**Decisioni precedenti ancora in vigore** (contesto in DIARIO-STORICO.md):
- `PESO_PRIOR_STAGIONE` non si tocca — richiesta esplicita dell'utente, 15/09. Per le strisce di
  forma c'è l'indicatore "in forma"/"in calo".
- **Principio dell'utente (15/09)**: il campionato è iniziato, un miglioramento isolabile e
  sicuro (soglia di campione, correzione limitata e smorzata) si implementa subito, non a fine
  stagione.
- Niente bottone "esporta rosa attuale": proposto e rifiutato il 15/09.
- Visibilità del repository: rimandata dall'utente ("ci penserò poi"), vedi *Prossimi passi*.

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
- `tools/calendario.mjs` — date delle partite (ora italiana → istante vero, in qualunque fuso
  giri: i runner sono in UTC), prima partita, turno infrasettimanale. Usato da entrambi i
  promemoria e da `tools/turno-infrasettimanale.mjs`.
- `tools/estrai-motore.mjs` — estrae il motore PURO da `index.html` per `taratura.mjs`/`ricalibra.mjs`,
  così le due copie non divergono mai.
- `tools/taratura.mjs` — diagnostica (stime vs voti reali), non scrive nulla.
- `tools/ricalibra.mjs` — scrive `dati/costanti.json` (vedi *Come funziona il motore*).
- `tools/controlla.mjs [ref]` — controllo di integrità, **da lanciare dopo ogni modifica**.
- `netlify/functions/schierato.mjs` — unica funzione Netlify (unica dipendenza vera,
  `package.json`/`package-lock.json`): ricorda se la giornata è già schierata.
- `tools/serve.mjs` — server statico locale su :8099. `tools/rosa-esempio.json` — rosa finta di prova.

## Prossimi passi

1. **Push di `dev` e merge su `main`, il prima possibile** — serve il via libera dell'utente (un
   deploy Netlify). Ogni giro di lunedì/martedì su `main` col codice vecchio fa un altro passo di
   ricalibrazione sugli stessi voti (28-29/09, 05-06/10), e i promemoria G6 partirebbero in
   ritardo. Se il merge arriva dopo lunedì 28/09 ~07:00 UTC, conflitto quasi certo su
   `dati/costanti.json` (la CI vecchia l'avrà riscritto): **tenere la versione di `dev`**.
2. **Decidere sulla formula di `RETTIFICA_PIAZZATI`** (`tools/ricalibra.mjs`): lo scarto si
   misura contro base+correzione precedente, quindi converge a *metà* dello scarto vero (R1 verso
   -0.20 invece di -0.40). Correggerla sola spingerebbe R1 a -0.30 sulla base di **2 rigori**
   (Colombo sbagliato, Zaccagni segnato: su G1-G5 in tutta la A solo 5 rigori tirati): la soglia
   `MIN_CAMPIONE=30` conta le presenze (79), non i rigori. Proposta: correggere la formula E
   aggiungere una soglia sui rigori tirati (es. almeno 10 per tag) prima di muovere la correzione.
3. **Verificare sul campo i promemoria della G6** (dopo il merge): scadenza sabato 10/10 alle
   14:55 italiane (12:55 UTC). In `dati/scadenza-promemoria.json` ogni orario "inviato" deve
   cadere prima di `2026-10-10T12:55Z`, e il testo deve dire le ore vere rimaste. 1h/30m possono
   ancora saltare per i ritardi del cron (punto 5).
4. **Verificare che torni la fonte principale** (dopo il merge): `dati/probabili.json` con
   `fonte` fantacalcio.it (circa 480 giocatori, moduli, panchine), workflow verde, niente più
   email.
5. **Decidere se vale la pena un innesco più affidabile del cron GitHub** per `dati.yml`/
   `promemoria.yml` (44% degli slot di `dati.yml` saltati, gap di ore su `promemoria.yml`).
   Opzione concreta: un cron esterno (es. cron-job.org) che chiama `workflow_dispatch` via API
   GitHub — serve un token con permessi di scrittura da conservare da qualche parte. Non deciso.
6. **Decidere sulla visibilità del repository** (pubblico oggi) — rimandata dall'utente. Se si
   passa a privato: tetto di 2000 minuti/mese di Actions (oggi illimitato) contro la frequenza
   del cron, e gli strumenti di diagnosi via API pubblica senza token smetterebbero di funzionare.
7. **Ritarare `PESO_AVVERSARIO`, `CASA_BONUS`, `DECADIMENTO_FORMA`** (non `PESO_PRIOR_STAGIONE`)
   quando ci saranno abbastanza giornate, con `taratura.mjs`.
8. **Calendario storico** (chi ha giocato contro chi, dove) per tarare `CASA_BONUS`/
   `PESO_AVVERSARIO` sui risultati veri — rimandato, non deciso.
9. **Mercato di riparazione e svincoli** — a gennaio, non prima.
10. **Provare sul telefono vero** i gesti (swipe fra tab, pull-to-refresh): verificati finora
    solo in emulazione.
11. **Da guardare quando capita, nessuna azione prevista**: dal 19/10 `ubuntu-latest` passa a
    Ubuntu 26 (gli script usano solo bash, git e node: controllare il primo run dopo); dal 25/10
    (ora solare) i cron in UTC scattano un'ora prima in ora italiana (venerdì 07-19 invece di
    08-20). I promemoria non ne risentono: ora calcolano sulle date vere.

## Problemi aperti

- **`RETTIFICA_PIAZZATI` si muove su pochissimi eventi** — vedi *Prossimi passi* 2.
- **`BONUS_MAX` (tetto di bonus a percentile 100 per ruolo) resta a intuito.** Calibrarlo
  richiederebbe isolare il bonus "da percentile puro" (gol/assist normali, non rigori): con poche
  giornate e pochi giocatori al vertice del ruolo rischia di inseguire il rumore.
- **Cadenza reale del cron GitHub Actions**: confermata su entrambi i workflow (15-16/09). Niente
  perdita di dati (il retry in `dati.yml` recupera le giornate mancanti), solo ritardo; i
  promemoria più vicini alla scadenza (1h/30m) saltano spesso. Vedi *Prossimi passi* 5.
- **La fonte di riserva oscilla**: `fantacalcio-online.com` restituisce percentuali diverse da
  un giro all'altro (82 → 73 → 82 per lo stesso giocatore), quindi quando è in uso committa a
  ogni giro. Innocuo, e con la fonte principale di nuovo funzionante gira solo se quella fallisce.
- **xG/Understat per l'"oracolo"**: bloccata da `robots.txt` (Understat) o anti-bot (FBref).
  Rimandata dall'utente (05/09).
- **Regolamento di lega non del tutto noto** (moduli ammessi, cambi, soglie del modificatore,
  cambio portiere) — non bloccante, default sotto *COSTANTI DI LEGA* in `index.html`.
- **Visibilità del repository (pubblico) non decisa** — vedi *Prossimi passi* 6.

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
- **`tools/ricalibra.mjs` fa un passo per giornata nuova, non per lancio** (dal 26/09). Prima
  ogni lancio sugli stessi voti era un passo di apprendimento in più (scoperto a mano la notte
  15-16/09, poi in CI il 26/09: 4 passi a settimana). Ora rilanciarlo è innocuo. Per vedere come
  va il modello senza scrivere nulla: `tools/taratura.mjs`. Per ricostruire le costanti da zero:
  replay su una copia temporanea, un passo per ogni arrivo di voti (metodo in DIARIO-STORICO.md
  → *Sessione del 26/09*).
- **Script che girano in CI: i runner GitHub sono in UTC.** Mai `new Date(anno, mese, giorno,
  ore, minuti)` per un orario italiano: in locale torna giusto, sul runner è sbagliato di 1-2
  ore (bug dei promemoria scoperto il 26/09). Provare sempre con `process.env.TZ = 'UTC'`
  impostato *dentro* il processo — su Windows Node ignora `TZ=...` passato da Git Bash per fusi
  diversi da UTC.
- **Un controllo "zero = sezione non letta" deve distinguere il vuoto vero**: se la pagina dice
  esplicitamente che la lista è vuota, contarlo e accettarlo (ballottaggi, 26/09).

**Aggiornamento di questo file**: lo tengo aggiornato io a fine di ogni blocco di lavoro
sostanziale. Le quattro sezioni in testa (*Stato attuale*, *Cosa abbiamo deciso*, *Prossimi
passi*, *Problemi aperti*) si **riscrivono** ogni volta, non si accodano — sono una fotografia,
non un registro. Il registro (cronologia completa, perché di ogni scelta) va in
DIARIO-STORICO.md, che invece cresce.
