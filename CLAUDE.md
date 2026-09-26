# App Formazione — Diario di bordo

Progetto separato dall'app asta (cartella superiore): quella serve a *comprare* ed è finita;
questa serve a *schierare* e deve reggere 38 giornate.

**Per il perché dietro ogni scelta, la cronologia completa e gli incidenti già risolti**: vedi
[DIARIO-STORICO.md](DIARIO-STORICO.md). Le quattro sezioni sotto invece **si riscrivono**, non si
accodano: fotografano il punto in cui siamo adesso, non l'elenco di tutto quello che è successo.

## Stato attuale

**v0.5 ONLINE E IN USO; su `dev` c'è già la v0.6, NON ANCORA PUBBLICATA.** Pubblicata su Netlify
(build vera via GitHub, non drag&drop: serve per `@netlify/blobs` in
`netlify/functions/schierato.mjs`), rosa vera importata, app installata sul telefono, notifiche
push attive. L'app schiera, sceglie il modulo, funziona offline, e la stima si mescola da sola con
i voti veri. Countdown e promemoria scaglionati su una scadenza vera. La GitHub Action scarica
probabili e voti da sola, con una fonte di riserva se la prima fallisce.

**⚠️ DEPLOY IN SOSPESO — ricordarlo all'utente a ogni sessione finché non è fatto.** L'utente
(26/09) è disposto a spendere un deploy per le modifiche grosse di `dev` e lo chiederà LUI, in una
richiesta dedicata solo a quello: mai farlo in automatico. Il merge `dev` → `main` tocca
`index.html`, quindi pubblica. Conviene farlo **prima di sabato 10/10** (G6): porta la correzione
dei gesti sul telefono, il controllo "partite concluse" dei voti del lunedì 12/10, i promemoria
nuovi (24h/8h/3h, silenzio notturno), il modificatore con la regola dei 4 difensori, la forza
delle squadre sulla scala giusta, i rigoristi corretti, il calendario e `sw.js` v0-6. Revisione
pre-deploy del 26/09 sera: nessun blocco, merge in avanti veloce (fast-forward). Prima del merge
rilanciare le prove (`prove-pipeline.mjs --pagine C:/Code/fantacalcio/.tmp-claude/pagine-voti`,
`prova-motore.mjs`, `controlla.mjs`). Al merge: se nel frattempo la Action ha scritto
`dati/costanti.json` su `main`, rifarlo col replay (`node tools/prove-pipeline.mjs ricalibra`
dice se torna); se ha scritto `dati/voti-6.json` con lo script vecchio, recuperare il calendario
con `node tools/fetch-voti.mjs 6 --solo-calendario`.

**Calendario**: giocate G1-G5 (voti scaricati, ricalibrazione fatta), sosta per le nazionali.
**G6 il 10-12/10**, prima partita Genoa-Fiorentina sabato 10/10 alle 15:00 (scadenza per schierare
14:55 italiane = 12:55 UTC). Due partite il lunedì 12/10 sera (Torino-Udinese alle 20:45).

**Rami**: `dev` = `main` + tutto il lavoro del 26/09 pomeriggio (app, script, prove, costanti,
calendario, diario); `main` è stato fuso dentro `dev` il 26/09 (commit solo-dati della Action),
quindi `dev` non è indietro su nulla. Su `main` scrive anche la Action (commit solo-dati). **Actions
verdi** al 26/09 12:06 UTC, probabili dalla fonte principale (fantacalcio.it, 484 giocatori).

**Netlify**: pubblica solo se cambia un file del sito (vedi *Regola di lavoro*). Il merge del 26/09
mattina (`9626bf3`) non doveva pubblicare: da confermare dall'utente sul pannello.

## Ultima sessione (26/09/2026 sera) in sintesi

Sei verifiche con subagenti in sola lettura (revisione pre-deploy, analisi della squadra,
permessi, cache, notifiche, catena voti → modello), poi le correzioni approvate dall'utente, tutte
su `dev` (`b762a57`, `e8e3c4c`), niente deploy. Dettagli in DIARIO-STORICO.md (*26/09 sera*):
- **Modificatore**: regola dei 4 difensori (dall'utente) e tabella standard al posto della
  conversione lineare con malus, come valore atteso (incertezza 0,37 misurata).
- **Forza delle squadre sulla scala giusta**: l'attacco misurato era il fantavoto grezzo (~6,5)
  mescolato con una stima su scala 5,75-6,15, e il peso contava le presenze: difensori e portieri
  perdevano ~0,66 a partita (Di Lorenzo -1,27, ora +0,15). Ora `normalizzaSquadre` + giornate.
- **Promemoria** 24h/8h/3h con silenzio notturno, notifica di prova dal workflow, avvisi quando
  "Ho schierato" non può funzionare; voti anche mercoledì/giovedì; `pull --rebase` prima dei push.
- App: secondo dito, soglia di 3px, pull-to-refresh senza doppio aggiornamento, costanti
  rilette con i dati, cronologia pulita all'avvio, `storage.persist()`; `sw.js` v0-6 (niente
  errori in cache, ripiego solo per le navigazioni, `renotify`).
- **Permessi**: le richieste inutili erano 6 (hook troppo rigido su `push -q`, parola "netlify"
  nei testi, `gh` in sola lettura) e c'era un buco (`git -C … push main` approvato). Hook corretto
  pronto in `C:\Code\fantacalcio\.tmp-claude\permessi\proposta.mjs`: **lo installa l'utente**.

## Sessione precedente (26/09/2026 pomeriggio) in sintesi

Richiesta: prove generali della G6, casi limite, script di prove, rigoristi e calendario storico
"da fare ora", e i gesti sul telefono ("lo scorrimento indietro dal modulo non funziona") con un
controllo generale dell'usabilità. Nessun deploy. Dettagli e numeri in DIARIO-STORICO.md (*Sessione
del 26/09/2026, pomeriggio*). Tutto su `dev`:

- **Swipe fra le schede rotto sul telefono vero, da sempre**: il browser mandava `pointercancel`
  dopo pochi millimetri e la direzione si leggeva da coordinate fasulle (da Moduli niente, da
  Campo verso destra si finiva su Rosa). Rifatti swipe e pull-to-refresh con eventi touch e
  `touch-action: pan-y`. Provati con eventi sintetici; col dito vero li prova l'utente.
- **Usabilità**: "indietro" di Android torna a Campo invece di uscire; sheet chiudibili tirando
  giù da ovunque quando sono in cima; la lista non salta più in cima a ogni ridisegno; tasto
  Aggiorna con stato; ricerca in "componi rosa" senza ridisegnare il campo; scheda giocatore senza
  doppioni; impostazioni con le cose settimanali in cima; aree sicure iPhone; ARIA sulle schede.
- **Voti**: si scrive una giornata solo se tutte le partite hanno `data-match-status="4"` (una
  partita in corso il lunedì sera poteva finire nel file per sempre).
- **`tools/prove-pipeline.mjs`**: 47 prove ripetibili (calendario, promemoria con orologio finto,
  ricalibrazione, voti sabotati). Hanno trovato due difetti veri, corretti: **l'anno a Capodanno**
  (una partita del 30/12 letta il 2/01 finiva nell'anno dopo, anche nell'app) e i **promemoria in
  coda** quando il cron è in ritardo (ora parte solo la soglia più vicina).
- **Rigoristi**: formula che converge allo scarto vero (non a metà) e soglia di 10 rigori tirati per
  tag. Con G1-G5 (2 rigori di R1) nessuna correzione: `rettificaPiazzati` vuota, ruoli invariati.
- **Calendario storico**: `dati/calendario.json` (G1-G5, poi scritto da `fetch-voti.mjs` a ogni
  giornata) e diagnostica `tools/taratura-partita.mjs`: fattore campo -0.01 ± 0.16 contro +0.16 del
  modello (al limite), avversario 1.39 ± 0.71 contro 1.4 (confermato).
- **Errore mio corretto**: avevo rimesso la vibrazione nel pull-to-refresh, tolta dall'utente il
  05/09.

**Decisioni in vigore** (contesto in DIARIO-STORICO.md):
- `PESO_PRIOR_STAGIONE` non si tocca (utente, 15/09). Per le strisce di forma c'è l'indicatore
  "in forma"/"in calo".
- **Principio dell'utente (15/09)**: a campionato iniziato, un miglioramento isolabile e sicuro
  (soglia di campione, correzione limitata e smorzata) si implementa subito.
- `RETTIFICA_PIAZZATI`: corretta il 26/09 pomeriggio su richiesta dell'utente (formula + soglia
  `MIN_RIGORI=10`).
- **Deploy**: solo quando l'utente lo chiede in una richiesta dedicata; ricordarglielo (26/09).
- **Niente vibrazione** nei gesti (05/09, ribadito dal diario il 26/09).
- **Modificatore di difesa** (utente, 26/09 sera): con la difesa a 3 non si applica. Nel codice:
  `MOD_MIN_DIFENSORI = 4` in campo con voto, media portiere + 3 migliori, tabella standard
  Fantacalcio.it `MOD_FASCE` (6 → +1, 6,5 → +3, 7 → +6, niente malus) — **la tabella è una mia
  ipotesi**, da confermare col regolamento della lega.
- **Promemoria** (utente, 26/09 sera: "correggi tu gli intervalli"): avviso di giornata nuova,
  poi 24h, 8h, 3h prima della scadenza, silenzio 23-08 italiane. Scelti sul cron reale (un giro
  ogni ~3,8 ore): non rimettere soglie a 1h/30m senza un innesco più affidabile.
- Niente bottone "esporta rosa attuale" (rifiutato il 15/09). Visibilità del repository: rimandata.
- Niente modalità "bypass permissions" per Claude: l'utente la ritiene poco sicura (26/09).

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

## ⚠️ Regola di lavoro corrente: si sviluppa su `dev`, deploy solo su richiesta

**Dal 04/09/2026, dopo l'incidente dei crediti Netlify** (una notte di lavoro autonomo ha bruciato
150 crediti con push ripetuti su `main`), aggiornata dall'utente il 26/09:

- **Tutto senza chiedere**, tranne i deploy: "se devi far scattare qualche deploy devo avertelo
  indicato esplicitamente, altrimenti aspetti; per tutte le altre cose agisci pure senza il mio
  permesso". Quindi modifiche, commit, `git push origin dev`, script, dati, diario, scelte tecniche
  con un default ragionevole: si fanno e si dichiarano nel resoconto, non si chiedono prima. Le
  domande restano solo per scelte davvero dell'utente (es. il modello di calcolo).
- Si lavora **su `dev`**, mai commit diretti su `main`. Merge `dev` → `main` e push su `main`
  **solo se l'utente lo chiede in quella sessione**, dicendo prima se farà partire un deploy.
  Mai `netlify deploy`/login/config.
- **Quando un merge pubblica**: `netlify.toml` fa partire la build solo se, rispetto all'ultima
  pubblicazione, cambia uno di `index.html`, `sw.js`, `manifest.webmanifest`, `netlify/`,
  `package.json`, `package-lock.json`. Script (`tools/`), workflow (`.github/`), `dati/`, diario:
  non pubblicano. Una modifica solo a `netlify.toml` non pubblica da sola. Se si aggiunge un file
  che il sito usa, va aggiunto anche all'elenco in `netlify.toml`.
- I commit **solo-dati** della GitHub Action vanno direttamente su `main`, come sempre.
- Pushare sempre con destinazione esplicita (`git push origin dev`), mai `git push` nudo.
- **Rete di sicurezza sui permessi** (file non versionati, in `C:\Code\fantacalcio\.claude\`): le
  regole `ask` chiedono sempre conferma per `git push` nudo, push che nominano `main`, comandi
  `netlify`; l'hook `decidi-permessi.mjs` approva da solo solo il lavoro confinato al progetto e
  scrive ogni decisione in `richieste-permessi.log`. Claude non modifica quell'hook da solo (il
  classificatore lo blocca, giustamente): le modifiche le applica l'utente. Guida completa:
  `C:\Code\fantacalcio\GUIDA-PERMESSI-CLAUDE.md`.

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
  volte a settimana; un deploy a ogni scrittura pubblicherebbe il sito altrettante volte.
  `netlify.toml` pubblica solo quando cambia un file del sito (vedi *Regola di lavoro*).
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
  `RETTIFICA_PIAZZATI` (15/09, formula corretta il 26/09) per il bonus dei rigoristi
  (`R1`/`R2`/`R3`), tarata sui rigori VERI contro la base `BONUS_PIAZZATI`, e solo da 10 rigori
  tirati per tag in su (`MIN_RIGORI`) — le punizioni (`P1`/`P2`/`P3`) restano a intuito,
  nei dati scaricati un gol su punizione non si distingue da uno normale.
- **prossima partita** (`rettificaPartita()`) — fattore campo (`CASA_BONUS=0.08`) + forza
  dell'avversario nel reparto che conta (`MV_SQUADRA`/`ATT_SQUADRA`, anche queste mescolate con
  il rendimento reale delle squadre, non ferme alle quotazioni di agosto). Sommata, non
  moltiplicata: un forte contro un forte resta forte.

Tutte le costanti sopra sono **dichiarate a intuito**, non ancora tarate su abbastanza giornate
(vedi *Prossimi passi*). `PESO_PRIOR_STAGIONE` in particolare: l'utente ha chiesto esplicitamente di
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
- `tools/fetch-voti.mjs` — voti a giornata conclusa (tutte le partite a `data-match-status="4"`),
  e insieme il calendario della giornata. `--da-file` per le prove, `--solo-calendario`.
- `dati/probabili.json`, `dati/voti-N.json`, `dati/costanti.json` — output degli scraper/di
  `ricalibra.mjs`, letti da `fetchDati()` (GitHub diretto, poi same-origin).
- `dati/calendario.json` — chi contro chi, dove, risultato, data e ora, giornata per giornata (dal
  26/09; G1-G5 ricostruite). Non lo legge l'app: serve alla taratura.
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
- `tools/taratura-partita.mjs` — diagnostica di `CASA_BONUS` e `PESO_AVVERSARIO` sul calendario
  vero, con margine d'errore; non scrive nulla.
- `tools/ricalibra.mjs` — scrive `dati/costanti.json` (vedi *Come funziona il motore*).
- `tools/controlla.mjs [ref]` — controllo di integrità, **da lanciare dopo ogni modifica** all'app.
- `tools/prove-pipeline.mjs` — prove ripetibili degli script CI (calendario, promemoria con orologio
  finto, ricalibrazione, voti sabotati con `--pagine DIR`), **da lanciare dopo ogni modifica** agli
  script. Niente rete, niente scritture nel repository.
- `tools/prova-motore.mjs` — invarianti del motore.
- `netlify/functions/schierato.mjs` — unica funzione Netlify (unica dipendenza vera,
  `package.json`/`package-lock.json`): ricorda se la giornata è già schierata.
- `tools/serve.mjs` — server statico locale su :8099. `tools/rosa-esempio.json` — rosa finta di prova.

## Prossimi passi

1. **Deploy di `dev`, quando l'utente lo chiede** (vedi *Stato attuale*): meglio prima di sabato
   10/10. Prima del merge: `node tools/controlla.mjs`, `node tools/prove-pipeline.mjs`,
   `node tools/prova-motore.mjs`; dopo, controllare che le Actions restino verdi.
2. **L'utente prova i gesti col dito vero** dopo il deploy: swipe avanti e indietro fra Campo,
   Rosa e Moduli (anche un colpo veloce), tiro in basso dalla cima per aggiornare, "indietro" di
   Android da Rosa/Moduli (deve tornare a Campo), tirare giù una scheda giocatore dal contenuto.
   Finora provati solo con eventi sintetici.
3. **Notifiche: provarle davvero (l'utente) dopo il merge**: GitHub → Actions → "Promemoria
   scadenza formazione" → Run workflow con "prova" spuntato. Verde + notifica sul telefono = la
   catena funziona (finora nessuna consegna è mai stata confermata); rosso con "Abbonamento
   scaduto" = riattivare dall'app e aggiornare il secret `PUSH_SUBSCRIPTION`. Controllare anche che
   esista la variabile `NETLIFY_SITE_URL` e che `<sito>/.netlify/functions/schierato?giornata=5`
   risponda in JSON. Poi sul campo, G6 (scadenza 10/10 12:55 UTC): in
   `dati/scadenza-promemoria.json` gli orari "inviato" devono stare prima della scadenza.
   **L'avviso di apertura G6, partito il 21/09, diceva "alle 17:00": si comincia alle 15:00**
   (bug del fuso già corretto, l'avviso non si rimanda).
3b. **Permessi (l'utente)**: installare l'hook corretto e le regole `git -C * push*` come da
   istruzioni date il 26/09 sera (copia di `.tmp-claude\permessi\proposta.mjs` su
   `.claude\decidi-permessi.mjs`, prove `prova-permessi.mjs` 26/26 e `prova-sessione.mjs` 28/28).
3c. **Tabella del modificatore**: confermare col regolamento della lega (`MOD_FASCE`).
4. **Verificare i voti della G6**: lunedì 12/10 (Torino-Udinese alle 20:45) deve uscire "giornata
   ancora in corso", senza email; martedì deve scrivere `dati/voti-6.json` completo (20 squadre),
   aggiornare `dati/calendario.json` (solo dopo il deploy) e fare un solo passo di ricalibrazione.
5. **Controllare su Netlify** (lo fa l'utente) che il merge del 26/09 mattina (`9626bf3`) non abbia
   pubblicato.
6. **Fattore campo, verso G10**: rilanciare `node tools/taratura-partita.mjs`. Su G1-G5 il fattore
   campo misurato è -0.01 ± 0.16 contro il +0.16 del modello (2.1 errori standard). Se resta
   fuori, proporre all'utente una correzione automatica di `CASA_BONUS` con lo schema di
   `ricalibra.mjs` (soglia, limite, smorzamento), oppure di abbassarla. `PESO_AVVERSARIO` è
   confermato dai dati (1.39 ± 0.71 contro 1.4).
7. **Decidere se vale la pena un innesco più affidabile del cron GitHub** per `dati.yml`/
   `promemoria.yml` (44% degli slot di `dati.yml` saltati, gap di ore su `promemoria.yml`).
   Opzione concreta: un cron esterno (es. cron-job.org) che chiama `workflow_dispatch` via API
   GitHub; serve un token con permessi di scrittura da conservare da qualche parte. Non deciso.
8. **Decidere sulla visibilità del repository** (pubblico oggi), rimandata dall'utente. Se si
   passa a privato: tetto di 2000 minuti/mese di Actions (oggi illimitato) contro la frequenza
   del cron, e gli strumenti di diagnosi via API pubblica senza token smetterebbero di funzionare.
9. **Ritarare `DECADIMENTO_FORMA`** (non `PESO_PRIOR_STAGIONE`) quando ci saranno abbastanza
   giornate, con `taratura.mjs`.
10. **Mercato di riparazione e svincoli**: a gennaio, non prima.
11. **Da guardare quando capita, nessuna azione prevista**: dal 19/10 `ubuntu-latest` passa a
    Ubuntu 26 (gli script usano solo bash, git e node: controllare il primo run dopo); dal 25/10
    (ora solare) i cron in UTC scattano un'ora prima in ora italiana (venerdì 07-19 invece di
    08-20). I promemoria non ne risentono: calcolano sulle date vere (provato).

## Problemi aperti

- **Rigoristi, pochi eventi e tag vecchi**: 5 rigori in tutta la A su G1-G5, 3 dei quali tirati da
  giocatori senza tag R sul listone (Maldini, Yeboah J., Varela G.). La correzione aspetta 10 tiri
  per tag; i tag del listone sono quelli di agosto e non si aggiornano da soli.
- **Una pagina dei voti rinominata si scopre con circa una settimana di ritardo**: sembra una
  giornata non ancora giocata (0 tabelle, uscita 2), e il passo va in rosso solo quando quella
  giornata diventa più vecchia dell'ultima conclusa. Accettato: i voti non servono per schierare
  la giornata successiva.
- **Il controllo "partite concluse" dipende da `data-match-status="4"`**: osservato su 50 partite
  su 50, ma lo stato di una partita in corso non l'abbiamo mai visto. Se l'attributo sparisce il
  log lo dice (`::warning::`), ma non blocca.
- **Lo storico voti sui telefoni non sa di che stagione è** (`index.html`, `caricaStorico`): ad
  agosto 2027 le giornate 1-38 risulterebbero già scaricate. Va salvata la `stagione` (c'è nei
  `voti-N.json`) e azzerato lo storico quando cambia — da fare prima della stagione nuova. Stesso
  per il resoconto. Collegato: un `voti-N.json` corretto dopo su GitHub non viene riscaricato da
  chi l'aveva già (correzioni a posteriori trascurabili: 1 su 1590 righe).
- **Fine stagione (giugno 2027)**: GitHub disattiva da solo i workflow programmati di un
  repository pubblico dopo 60 giorni senza attività. D'estate la Action non avrà dati nuovi da
  committare, quindi ad agosto i workflow potrebbero risultare disattivati: vanno riattivati a
  mano da GitHub (Actions → workflow → "Enable workflow") prima della nuova stagione.
- **`BONUS_MAX` (tetto di bonus a percentile 100 per ruolo) resta a intuito.** Calibrarlo
  richiederebbe isolare il bonus "da percentile puro" (gol/assist normali, non rigori): con poche
  giornate e pochi giocatori al vertice del ruolo rischia di inseguire il rumore.
- **Cadenza reale del cron GitHub Actions**: gap di ore, niente perdita di dati. I promemoria più
  vicini alla scadenza (1h/30m) saltano spesso. Vedi *Prossimi passi* 7.
- **La fonte di riserva oscilla**: `fantacalcio-online.com` restituisce percentuali diverse da
  un giro all'altro, quindi quando è in uso committa a ogni giro. Innocuo.
- **xG/Understat per l'"oracolo"**: bloccata da `robots.txt` (Understat) o anti-bot (FBref).
  Rimandata dall'utente (05/09).
- **Regolamento di lega non del tutto noto** (moduli ammessi, cambi, soglie del modificatore,
  cambio portiere): non bloccante, default sotto *COSTANTI DI LEGA* in `index.html`.
- **Visibilità del repository (pubblico) non decisa**: vedi *Prossimi passi* 8.

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
- **Gesti: mai eventi pointer per trascinamenti su contenuto che scorre.** Sul telefono vero il
  browser manda `pointercancel` appena decide di scorrere, e il gesto muore a metà; in emulazione
  non succede, per questo lo swipe è sembrato funzionare per tre settimane (26/09). Usare eventi
  touch più `touch-action`, e provare anche la sequenza "pointerdown, pointermove, pointercancel".
- **Permessi: comandi scritti in modo che l'hook li riconosca** (26/09 sera, 6 richieste inutili
  all'utente in una sessione). Push su dev solo come `git push origin dev` (niente `-q`, niente
  `git -C`); testi lunghi (diario, messaggi di commit) con Write/Edit e `git commit -F <file in
  C:\Code\fantacalcio\.tmp-claude\>`, mai heredoc in Bash; `netlify.toml` e simili con Read, non
  `cat`; stato delle Actions con `curl` GET all'API, non `gh`; file temporanei in
  `C:\Code\fantacalcio\.tmp-claude\`. Vale anche dopo che l'utente avrà installato l'hook nuovo.
- **Prima di aggiungere un dettaglio "di gusto" (vibrazione, suoni, animazioni), cercarlo nel
  diario storico**: la vibrazione era già stata tolta dall'utente il 05/09 ed è stata rimessa per
  errore il 26/09.

**Aggiornamento di questo file**: lo tengo aggiornato io a fine di ogni blocco di lavoro
sostanziale. Le sezioni *Stato attuale*, *Ultima sessione*, *Prossimi passi* e *Problemi aperti*
si **riscrivono** ogni volta, non si accodano — sono una fotografia, non un registro. Il registro (cronologia completa, perché di ogni scelta) va in
DIARIO-STORICO.md, che invece cresce.
