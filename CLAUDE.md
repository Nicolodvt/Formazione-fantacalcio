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

**Calendario**: giocate G1-G5 (voti scaricati, ricalibrazione fatta), sosta per le nazionali.
**G6 il 10-12/10**, prima partita Genoa-Fiorentina sabato 10/10 alle 15:00 (scadenza per schierare
14:55 italiane = 12:55 UTC). Due partite il lunedì 12/10 sera.

**Rami**: `dev` e `main` allineati sul codice dal 26/09 (merge `9626bf3`); `dev` ha in più solo
commit di diario. Su `main` scrive anche la Action (commit solo-dati). **Actions verdi**: primo giro
dopo il merge (26/09 12:06 UTC) riuscito, probabili di nuovo dalla fonte principale (fantacalcio.it,
484 giocatori, moduli per tutte le 20 squadre), action su Node 24.

**Netlify**: pubblica solo se cambia un file del sito (vedi *Regola di lavoro*). Il merge del 26/09
toccava solo script/workflow/dati/diario, quindi non doveva pubblicare — Claude non ha accesso a
Netlify, va confermato dall'utente sul pannello (commit `9626bf3` saltato/annullato).

## Ultima sessione (26/09/2026) in sintesi

Partita da "ricevo email che le Actions falliscono, risolvi e controlla tutto il resto". Dettagli,
numeri e test in DIARIO-STORICO.md (*Sessione del 26/09* e *26/09 mattina*). Tutto già su `main`:

- **Email "failed"**: lo scraper principale scambiava "Nessun ballottaggio" (vero, a tre settimane
  dalla G6) per una sezione non letta; l'app era rimasta una settimana sulla fonte di riserva.
  Corretto (lo zero passa solo se dichiarato da tutte le squadre).
- **Promemoria 2 ore in ritardo, da sempre in CI**: `tools/calendario.mjs` leggeva l'orario nel
  fuso della macchina (UTC sui runner). Corretto con conversione esplicita da Europe/Rome.
- **Ricalibrazione ripetuta** fino a 4 volte a settimana sugli stessi voti: ora un passo solo per
  giornata nuova; `dati/costanti.json` rigenerato (A 0.225, prima 0.299).
- **Voti che potevano fermarsi in silenzio** (errori ingoiati dal workflow): ora `fetch-voti.mjs`
  distingue "non ancora giocata/in corso" (silenzio) da "rotto" (email), e controlla ≥11
  giocatori per squadra contro i file parziali (la G6 ha partite il lunedì sera).
- **Abbonamento push scaduto**: prima risultava "spedito"; ora un'email per giornata con le
  istruzioni, e nel file di stato resta `"abbonamento-scaduto"`.
- **Netlify**: da elenco di esclusioni a elenco di inclusioni, più una guardia che la regola vecchia
  non aveva (annullava anche un deploy chiesto a mano).
- **Action su Node 24** (`checkout`/`setup-node` v6).
- **App provata nel browser** con la rosa vera: nessun errore; coi dati della fonte principale
  modulo 3-4-3, Esposito F.P. titolare, panchina con percentuali vere.
- **Permessi di Claude**: lavora da solo dentro il progetto senza chiedere, tranne ciò che fa
  deploy o esce dal progetto. Meccanismo e istruzioni per riusarlo altrove:
  `C:\Code\fantacalcio\GUIDA-PERMESSI-CLAUDE.md` (fuori dal repository, contiene percorsi del PC).

**Decisioni in vigore** (contesto in DIARIO-STORICO.md):
- `PESO_PRIOR_STAGIONE` non si tocca (utente, 15/09). Per le strisce di forma c'è l'indicatore
  "in forma"/"in calo".
- **Principio dell'utente (15/09)**: a campionato iniziato, un miglioramento isolabile e sicuro
  (soglia di campione, correzione limitata e smorzata) si implementa subito.
- `RETTIFICA_PIAZZATI` (formula dei rigoristi): difetto noto, **rimandato dall'utente il 26/09**
  ("più avanti, per ora va bene così") — vedi *Prossimi passi*.
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
  `RETTIFICA_PIAZZATI` (15/09) per il bonus dei rigoristi (`R1`/`R2`/`R3`), tarata sui gol/rigori
  VERI del giocatore invece che a intuito — le punizioni (`P1`/`P2`/`P3`) restano a intuito,
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

1. **Verificare sul campo i promemoria della G6** (primo test vero del fix del fuso): scadenza
   sabato 10/10 alle 14:55 italiane (12:55 UTC). In `dati/scadenza-promemoria.json` ogni orario
   "inviato" deve cadere prima di `2026-10-10T12:55Z`, e il testo deve dire le ore vere rimaste.
   Se compare `"abbonamento-scaduto"` (e arriva l'email), le notifiche vanno riattivate dall'app e
   il secret `PUSH_SUBSCRIPTION` aggiornato. 1h/30m possono ancora saltare per i ritardi del cron.
2. **Verificare i voti della G6** (primo test vero dei codici d'uscita di `fetch-voti.mjs`): lunedì
   12/10 mattina deve uscire "giornata ancora in corso" senza email (due partite la sera), martedì
   deve scrivere `dati/voti-6.json` completo (20 squadre) e fare un solo passo di ricalibrazione.
3. **Controllare su Netlify** (lo fa l'utente) che il merge del 26/09 (`9626bf3`) non abbia
   pubblicato.
4. **`RETTIFICA_PIAZZATI`, quando l'utente vorrà riprenderla**: lo scarto si misura contro
   base+correzione precedente, quindi converge a *metà* dello scarto vero (R1 verso -0.20 invece
   di -0.40). Correggerla sola spingerebbe R1 a -0.30 sulla base di **2 rigori** (su G1-G5 in tutta
   la A solo 5 rigori tirati): `MIN_CAMPIONE=30` conta le presenze (79), non i rigori. Proposta:
   correggere la formula E aggiungere una soglia sui rigori tirati (es. almeno 10 per tag).
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
    08-20). I promemoria non ne risentono: calcolano sulle date vere.

## Problemi aperti

- **`RETTIFICA_PIAZZATI` si muove su pochissimi eventi** — vedi *Prossimi passi* 2.
- **Una pagina dei voti rinominata si scopre con circa una settimana di ritardo**: sembra una
  giornata non ancora giocata (0 tabelle, uscita 2), e il passo va in rosso solo quando quella
  giornata diventa più vecchia dell'ultima conclusa, cioè quando le probabili passano al turno
  dopo. Accettato: i voti non servono per schierare la giornata successiva, e l'alternativa
  (sapere quando è finita una giornata passata) richiederebbe di archiviare il calendario.
- **Fine stagione (giugno 2027)**: GitHub disattiva da solo i workflow programmati di un
  repository pubblico dopo 60 giorni senza attività. D'estate la Action non avrà dati nuovi da
  committare, quindi ad agosto i workflow potrebbero risultare disattivati: vanno riattivati a
  mano da GitHub (Actions → workflow → "Enable workflow") prima della nuova stagione.
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
sostanziale. Le sezioni *Stato attuale*, *Ultima sessione*, *Prossimi passi* e *Problemi aperti*
si **riscrivono** ogni volta, non si accodano — sono una fotografia, non un registro. Il registro (cronologia completa, perché di ogni scelta) va in
DIARIO-STORICO.md, che invece cresce.
