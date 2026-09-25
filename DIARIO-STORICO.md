# Diario storico — App Formazione

Archivio del ragionamento, delle verifiche fatte sul campo e degli incidenti già risolti, spostato
qui il 15/09/2026 per tenere [CLAUDE.md](CLAUDE.md) leggero (veniva riletto per intero — 87KB — a
ogni sessione che tocca questo progetto, anche solo per housekeeping). Nulla di quello che segue è
stato buttato: se serve capire *perché* una scelta è fatta in un certo modo, non solo *come
funziona ora*, è qui. Ordine cronologico, non per argomento.

## Aggiornamenti e crediti Netlify (04/09/2026)

**Problema individuato prima di collegare Netlify, non dopo.** La Action scrive su `dati/` fino a
7 volte a settimana. Con un collegamento Netlify normale (continuous deployment sul push),
**ognuna di quelle scritture pubblicherebbe il sito**: non un rischio di un'altra notte fuori
controllo, ma il comportamento strutturale e permanente del collegamento standard, ogni
settimana, per sempre. L'utente ha fatto bene a fermarsi a chiederlo prima di collegare qualcosa.

**Soluzione: i dati non passano più da un deploy per raggiungere il telefono.**
`fetchDati()` in `index.html` prova prima a leggere `dati/*.json` **direttamente da GitHub**
(gratis, istantaneo, nessuna build coinvolta) e solo se GitHub non risponde ripiega sulla copia
locale pubblicata con l'app — che resta comunque come rete di sicurezza, mai rimossa. `sw.js`
precarica anche la copia GitHub per l'offline.

**Condizione: il repository deve essere pubblico.** Deciso in chat il 04/09 — niente di sensibile
dentro (formazioni Serie A pubbliche, nessuna password). Reso pubblico dall'utente il 04/09,
verificato che `fetchDati()` legge davvero da GitHub (200, non più 404).

**Rete di sicurezza aggiuntiva**: `netlify.toml` ha un `ignore` che salta il deploy se rispetto
all'ultimo pubblicato cambia solo dentro `dati/` o solo un file `.md`. Vale anche se in futuro
qualcosa touchasse per errore `main` con un commit solo-dati.

**Perché non l'API di Claude al posto dello scraper (chiesto e valutato il 04/09):** il costo dei
deploy non dipende da come arrivano i dati, solo da come li pubblichiamo — quindi non risolverebbe
niente qui. Sul merito, la pagina probabili è già scritta da fantacalcio.it in un formato ordinato:
leggerla è gratis e affidabile al 100%. Un'API a pagamento avrebbe senso per compiti di *giudizio*
che lo scraper strutturalmente non può fare (leggere un articolo di cronaca e dedurne un dubbio non
ancora nella pagina strutturata, scrivere il perché di un consiglio) — non per sostituire una
lettura di dati già pronti.

## Notifiche push (04/09/2026)

**Scelta dell'utente**, esplicitamente: notifica push vera, non un promemoria da calendario —
sapendo che significa più infrastruttura da costruire e mantenere.

**Come funziona:**
- `index.html`, foglio Impostazioni → *Notifiche*: "Attiva promemoria" chiede il permesso al
  browser, iscrive il service worker al servizio push (chiave pubblica VAPID — pubblica per
  definizione, sta nel codice), poi mostra l'abbonamento come testo da copiare.
- Quell'abbonamento va incollato **una tantum** come secret GitHub `PUSH_SUBSCRIPTION`. Deciso di
  NON costruire un server che lo salvi da solo: con un solo utente e un abbonamento che cambia
  raramente, un copia-incolla occasionale è più semplice di infrastruttura in più da mantenere.
- `tools/invia-promemoria.mjs`, dentro `.github/workflows/dati.yml` subito dopo il fetch delle
  probabili: trova la prima partita della giornata, e se non ha già avvisato per quella giornata
  (il numero sta in `dati/promemoria.json`) spedisce un push con orario e avversari. Se i secret
  non sono impostati esce senza errore.
- `sw.js` gestisce `push` (un solo `tag` fisso così non si accumulano) e `notificationclick`.
- `web-push` (libreria npm) si scarica al volo nel workflow con `npm install --no-save`.

**Chiavi VAPID**: generate localmente il 04/09. La pubblica è nel codice (`index.html` e
`invia-promemoria.mjs`, devono restare identiche). La privata non è in nessun file del repo — se
le chiavi si rigenerano mai, vanno cambiate in entrambi i posti insieme.

**Cosa non era verificabile in sandbox**: `Notification.permission` a `"denied"` di default
impediva di testare il vero click "Attiva promemoria" in quell'ambiente. Verificato invece tutto
il resto (gestione permesso negato, `invia-promemoria.mjs` contro dati veri, secret mancanti,
abbonamento non valido).

## Sette correzioni dal primo uso vero (09/09/2026, sera)

Dopo il primo giro reale sull'app pubblicata, l'utente ha segnalato sette cose da rivedere,
discusse una per una con piano e stima di rischio prima di scrivere codice.

1. **Vista Moduli lenta** — `classificaModuli()` rifaceva `valuta()` (1500 simulazioni) per
   tutti e 7 i moduli a ogni tocco. Corretto con una cache a fingerprint economico
   (`chiaveModuli()`, nessuna simulazione) su rosa/bloccati/override/dati/storico/correzioni/
   forza-squadre; `vistaCampo()` ora legge lo stesso risultato invece di ricalcolare.
2. **Modulo migliore di default, non 4-3-3 fisso** — `applicaModuloAutomatico()`, chiamata in
   testa a `render()`: se per la giornata corrente non hai ancora scelto un modulo a mano
   (`S.giornataModuloManuale !== PROB.giornata`), imposta da solo quello con più punti attesi.
   **Opzione A** scelta esplicitamente dall'utente fra due: si applica solo finché non tocchi tu
   un modulo diverso, dopo resta quello finché non arriva una giornata nuova — mai sovrascrive
   una scelta deliberata. Verificato dal vivo: 3-4-3 si autoseleziona all'apertura; scegliendo
   4-4-2 a mano, resta 4-4-2 anche dopo un refresh.
3. **"Le tue scelte vs il modello"** — nuova sezione in Impostazioni. Risponde alla domanda
   dell'utente ("se schiero diverso dal consiglio, ha senso dirlo all'app?"): il modello impara
   già da solo dai voti veri indipendentemente da cosa schieri, quindi questa non è una
   correzione — è trasparenza/fiducia. Al tocco di "Ho schierato" (`catturaResoconto()`), si
   salva sia l'undici vero sia quello che il modello puro avrebbe scelto per lo stesso modulo
   (stesso calcolo con `S.bloccati` svuotato per un istante). Quando arrivano i voti veri,
   `puntiRealiXI()` (stessa formula di `simula()` ma sui fantavoti reali) confronta i due
   undici, e `otticoAPosteriori()` calcola il massimo possibile col senno di poi. Verificato con
   dati veri di G3 (due giocatori scambiati apposta, scarto reale di 4.0 fantavoto): il confronto
   torna esatto. Salvato in `fantaFormazione_resoconto`, una riga per giornata.
4. **Swipe dall'intestazione della scheda giocatore** — `attivaTrascinamentoSheet()` accettava il
   gesto solo dalla maniglia; ora anche da `.sheet-head`. Solo la scheda giocatore, non
   Impostazioni — richiesta specifica.
5. **Doppia conferma** per "Cancella rosa" e "Disattiva notifiche" — `confermaPericolosa()`, un
   riquadro nello stile dell'app invece del `confirm()` del telefono.
6. **Colori nella scheda giocatore** — prima tutta tinta neutra tranne il pallino percentuale.
   Aggiunto riusando lo stesso linguaggio cromatico già in uso: `rolebar`, "Fantamedia attesa" in
   colore accento, "Prende voto" come badge colorato, segno di "prossima partita"/"rendimento
   reale" colorati verde/rosso.
7. **Contatore rosa realistico** — "Difensore 8/8" era "quanti hai/quanti puoi averne" (sempre
   pieno a stagione avviata). Ora è "disponibili questa giornata/quanti in rosa", escludendo solo
   infortunati e squalificati (i dubbi restano contati).

**Verificato**: `controlla.mjs`, `prova-motore.mjs`, `taratura.mjs` puliti prima e dopo. Tutti e
sette provati dal vivo nel browser.

## Countdown e promemoria scaglionati (09/09/2026)

Richiesta esplicita: un countdown in testata verso la scadenza per schierare, e promemoria push
scaglionati (24h/12h/6h/2h/1h/30min prima) che si fermano da soli appena schierato.

**Il countdown, tutto client-side.** `calcioInizioGiornata()` trova il momento più vicino fra
**tutte** le partite del turno, riusando la logica di `tools/calendario.mjs` (`parseData`)
**duplicata** apposta in `parseDataPartita()` — il progetto non condivide codice fra Node e
browser se non per il motore (`estrai-motore.mjs`); se cambia il formato data va aggiornato in
entrambi i posti. `MINUTI_SCADENZA=5` (calcio d'inizio meno 5 minuti, a intuito).
`statoScadenza()` punta alla scadenza finché `S.giornataSchierata` non è marcata, poi al calcio
d'inizio. `S.giornataSchierata` è un confronto (si "dimentica" da solo a giornata nuova), non un
flag da azzerare a mano. Il timer è l'unica eccezione dichiarata al principio "nessun timer in
sottofondo": gira ogni secondo ma solo in primo piano.

**Il problema architetturale vero: far sapere a GitHub che hai schierato.** I promemoria partono
da un cron fisso — il server non sa nulla del telefono, ed è voluto (zero credenziali nel
browser). Sopprimere la notifica lato telefono è stato scartato: iOS può revocare l'iscrizione
push se un push non produce una notifica visibile. **Discusse esplicitamente tre opzioni**
(funzione Netlify, nessuna soppressione, meno soglie senza soppressione): scelta la funzione
Netlify, dopo aver verificato che le Functions hanno una quota **separata** dai build minutes
(quelli bruciati nell'incidente dei 150 crediti).

**`netlify/functions/schierato.mjs`** — GET legge lo stato, POST lo scrive, un unico blob JSON
con al massimo le ultime 6 giornate tenute. Nessuna autenticazione (app per una sola persona,
rischio residuo trascurabile).

**`tools/promemoria-scadenza.mjs`** (`.github/workflows/promemoria.yml`, ogni 15 minuti) — non
tocca mai fantacalcio.it, legge solo `dati/probabili.json` già sul disco. Per ogni soglia non
ancora registrata, se il momento è arrivato entro una finestra di 20 minuti chiama la funzione
Netlify (`eGiaSchierato`, fallisce "aperto" se non risponde — tacere per un dubbio tecnico
sarebbe peggio) e manda il push se non sei già schierato. Una soglia trovata scaduta OLTRE la
finestra si segna "saltata" invece di spedirla in ritardo.
**Bug preso in test, non spedito**: `webpush.setVapidDetails()` lancia un'eccezione non gestita
se la chiave è malformata — su uno script che gira ogni 15 minuti avrebbe crashato 96 volte al
giorno. Avvolto in try/catch.

**Resta distinto da `invia-promemoria.mjs`**: quello avvisa una volta sola dell'apertura di una
giornata nuova, scopo diverso da "insisti finché non hai schierato".

## Seconda fonte per le probabili (09/09/2026)

**Fantagazzetta.com, il candidato più ovvio, non esiste più** — confluito dentro fantacalcio.it
(confermato dall'utente). Anche fantapazza.com è NXDOMAIN.

**Trovato tramite ricerca web**: `fantacalcio-online.com`, un aggregatore di quattro redazioni
(Fantacalcio.it, Gazzetta, SOS Fanta, Sky). Markup pulito (`prb-tabella`, `prb-nome`,
`prb-cella--certo/probabile/dubbio/fuori`). `robots.txt` insolito — nomina esplicitamente crawler
di addestramento IA (incluso ClaudeBot) come disallowed per training, ma con `User-agent: * /
Allow: /` per un crawler generico dichiarato come questo. Segnalato per trasparenza, non trattato
come istruzione.

**`tools/fetch-probabili-alt.mjs`** — gira SOLO se il principale fallisce. **Non è un sostituto
alla pari**: fantacalcio-online.com non condivide gli id numerici, quindi l'aggancio è per
COGNOME scoped alla squadra. Se il cognome non è univoco, il giocatore viene saltato e loggato.

**Tre bug trovati provandolo contro la pagina vera**:
- Split ingenuo su `"prb-incontro__lato"` — `"...--ospite"` lo contiene come prefisso, quindi
  ogni partita risultava senza nome squadra ospite (zero giocatori agganciati). Corretto con
  `indexOf` sul marcatore esatto.
- Formati di cognome incompatibili ("NUNO TAVARES" vs "Tavares N."). Aggiunto un confronto sulla
  prima parola del nome nel listone cercata fra le parole del nome trovato. Da 11 non agganciati
  su 228 a 5.
- Spazi ("Del Prato" vs "Delprato") — aggiunto confronto anche senza spazi.
Dei 5 rimasti: 2 ambiguità reali (due "Martinez" all'Inter), 3 giocatori assenti dal listone.

**Il numero di giornata** si ricava dai link interni `/voti/N-giornata/...` (il più frequente,
non il primo).

**Limiti dichiarati** (coerenti con "minimo indispensabile" chiesto dall'utente): nessun `modulo`
per squadra, nessuna sfumatura `incerto`+tasso di subentro, mai girato per davvero in una Action
(solo `--prova`). Soglia minima di sicurezza (100 giocatori agganciati) blocca la scrittura.

## La decisione che regge tutto: fetcher fuori dall'app

fantacalcio.it non manda header CORS. Un `index.html` aperto nel browser **non può** chiamarlo, né
leghe.fantacalcio.it. Verificato che `fantacalcio.it/api/v1/Excel/votes/21/1` risponde `401` senza
account.

"Single-file autosufficiente" e "i dati arrivano da soli" non stanno insieme senza un pezzo che
gira su un server. Soluzione: **separare chi scarica da chi decide**:

```
GitHub Action (7×/sett.)  →  dati/probabili.json  →  app (fetch da GitHub, poi same-origin)
   fragile, sacrificabile        il contratto          stupida, autosufficiente
```

Conseguenze, tutte volute: nessuna credenziale nel browser; niente CORS (file same-origin);
offline funziona (il service worker cachea anche i dati); se il fetcher muore l'app continua con
l'ultimo file buono dichiarandone la data.

**Sito Netlify separato da quello dell'asta.** Il `sw.js` dell'asta ha `scope:"./"`,
network-first che cachea ogni GET: servita dalla stessa origine, questa app verrebbe intercettata
e in offline mostrerebbe l'app asta.

## L'aggancio: id di fantacalcio.it (verificato)

**Gli `id` del listone dell'asta SONO gli id di fantacalcio.it.** Malen è `5585` nel listone e in
`fantacalcio.it/serie-a/squadre/roma/malen/5585`; Svilar è `5841` in entrambi.

Verifica su 480 giocatori estratti dalle probabili di G3: 473/480 trovati nel listone (98,5%),
zero squadra/ruolo/nome discordanti, copertura 195/204 (96%) sui giocatori con score ≥ 50.

**Non si incrociano mai i nomi** — "Martinez L." (listone) vs "Lautaro Martinez" (sito) sarebbe
una sorgente infinita di errori silenziosi. Si usa solo l'id. I 7 non trovati sono arrivi tardivi
che il listone non ha (utili solo per il mercato di riparazione).

## Cosa dice la pagina delle probabili

HTML servito dal server, nessun JavaScript da eseguire. `class="matchweek"` → giornata;
`<li class="match match-item">` → partita, due `card team-card` (prima la casa); `player-list
starters`/`reserves` → 11+13; per giocatore: `data-status`, `class="role" data-value="p|d|c|a"`,
`aria-valuenow` (percentuale); sezioni `suspendeds`/`injureds`/`dubts`/`cautioneds`/`ballots`.
`data-championship-id="21"` = Serie A 2026/27, stesso id dell'endpoint voti.

**Chi non compare nelle probabili non è un buco, è un'informazione**: verificato che McTominay,
Orsolini e Zaniolo mancano dai 24 e sono tutti in `injureds` con motivazione.

## Come funziona il motore — dettagli e verifiche

(Il riassunto attivo è in CLAUDE.md → *Come funziona il motore*. Qui il resto.)

Due cose imparate facendolo, non ovvie all'inizio:
- **Il subentro va sommato solo a chi non parte titolare.** Sommandolo a tutti, i titolari
  diventavano tutti 91% e la lista perdeva ogni informazione.
- **`data-status="warn"` ce l'hanno TUTTE le riserve** (260 su 260): è un dubbio dichiarato solo
  quando sta su un titolare (43 casi). Applicarlo a tutti penalizzava due volte.

Verificato che con una difesa sana i moduli si equivalgono (modificatore 6.20-6.21), e che con due
difensori in dubbio conviene schierarne **meno**, non di più.

## Cosa è stato verificato davvero (snapshot 09/09)

| prova | esito |
|---|---|
| import export asta schema 1 | 25 su 25 agganciati |
| campo, rosa, moduli, scheda giocatore | funzionanti a 375px |
| offline vero (server spento, ricarica) | app completa dalla cache, dati inclusi |
| service worker su http | registrato e `activated` |
| dati mancanti | dichiara "Nessun dato", ripiega sul `titPct` del listone |
| dati vecchi di 6 giorni | avviso rosso esplicito, app che continua a funzionare |
| tutti e 7 i moduli a 375px | una riga per reparto, nessun overflow |

## Due difetti trovati solo guardandola

1. **Tutti i giocatori a 91%** — il subentro sommato anche ai titolari.
2. **Orario partita "01/01 01:00"** — due `match-date` per partita, il primo un segnaposto mai
   compilato (`startDate="1970-01-01"`). Corretto cercando dentro `match-info`.

Conferma della regola ereditata: i controlli dicono che il codice c'è, non che è giusto.

## Strumenti

- `node tools/fetch-probabili.mjs [--prova]` — scarica le probabili, `--prova` valida senza scrivere.
- `node tools/controlla.mjs [ref]` — confronta con un commit, dice cosa è sparito fra funzioni,
  listener, selettori CSS e id.
- `node tools/serve.mjs` — server statico su :8099.
- `tools/rosa-esempio.json` — rosa finta in schema 1.

## Cosa è arrivato con la notte del 03→04/09

**Bersagli da dito.** Misurando l'area toccabile reale con `elementFromPoint`, il pulsante
impostazioni risultava 30×28px contro i 44×44 della linea guida. Corretto estendendo l'area con
uno pseudo-elemento.

**Scraper dei voti** (`tools/fetch-voti.mjs`), validato su G1 e G2. Due trappole disinnescate:
- Il sito pubblica tre voti affiancati (Redazione Fantacalcio, Statistico, Italia); la nostra lega
  usa il primo. Sbagliare colonna non avrebbe dato errore, solo uno storico falso — ora l'ordine
  si verifica dalle icone di intestazione.
- "Senza voto" è codificato con la sentinella 55, non una casella vuota. Preso per buono dava
  media di giornata 9.98, intercettato dal controllo sulla media attesa.

**Il modello è tarato bene**: G1+G2 su 331 giocatori, media stimata 6.13 contro 6.14 reale, scarto
massimo 0.17 sui portieri. Sull'ordinamento due giornate non dicono nulla (Spearman 0.32), costanti
non ritoccate con n=2.

**Casi limite**, tutti retti senza errori: rosa vuota, un solo giocatore, zero portieri, undici
senza panchina, nessun attaccante.

**Tre varianti grafiche** sul branch `grafica-varianti` (mai fuso in `main`): A "Campo vero", B
"Chiara", C "Densa". Da decidere.

## La revisione indipendente, e gli undici bug che ha trovato (03→04/09)

Due revisori indipendenti hanno riletto motore e scraper. **Tutti i test scritti fino a quel
momento passavano, e i bug c'erano lo stesso** — il giro più redditizio del progetto.

### Il peggiore: l'app preferiva chi non gioca

`contributoAtteso()` sottraeva 6.0 come voto di riferimento — `certezza × (fantamedia − 6)`. Per
chi ha fantamedia sotto 6 quel fattore è negativo, quindi moltiplicarlo per una certezza più alta
lo rende *più* negativo. Colpiva tutti i portieri e più di metà dei difensori. Riprodotto: Svilar
al 90% e due riserve al 5%, l'app mandava in porta una riserva.

Il criterio giusto: chi resta senza voto e senza sostituto vale zero, non 6 (`simula()` già lo
faceva). Valore atteso corretto: `certezza × fantamedia`.

**Perché i test non l'avevano visto**: la rosa di prova aveva i tre portieri tutti al 90%, quindi
a certezza costante l'ordinamento tornava giusto per caso. *Le prove vanno fatte su dati che
variano, non su dati comodi* — la lezione più importante della notte.

### Gli altri, nel motore

- Il subentro annullava i tetti: la coda si sommava DOPO i tetti su infortunati, che risalivano
  da 0.12 a 0.196 (tutti e 42 identici al 19,6%).
- I cambi si scorrevano dai titolari mancanti invece che dalla panchina (il regolamento fa il
  contrario).
- La panchina non pesava se un cambio serve in quel ruolo.
- I fissati eccedenti venivano troncati in ordine di inserimento in rosa (stessa rosa, formazioni
  diverse a seconda di come composta).
- Dati mutilati (senza `squadre`/`indisponibili`) facevano esplodere il calcolo, cache non
  validata (proprio quella usata offline).
- Squadra fuori dal turno → certezza fino al 100% e nessun avviso.

### Negli scraper

- Le ammonizioni venivano buttate (non sono un bonus, sono una classe sul voto): senza, 31 scarti
  su 293, tutti di esattamente −0.5.
- Mancava la riconciliazione `fantavoto = voto + bonus + ammonizione`: sui dati veri, 262
  quadravano coi pesi base e i restanti 31 aggiungendo il malus da ammonizione. Zero casi non
  spiegati su 293.
- L'ordine delle tre colonne di voto era verificato solo sulla prima tabella su venti.
- Più: unicità squadre, soglie su indisponibili/ballottaggi/percentuali/panchine, `matchweek`
  concordi, timeout fetch, HTML troncato, ancoraggio nome squadra, marcatori senza `>` finale.

**Il metodo che ha funzionato**: non fidarsi che una validazione sia buona perché passa sui dati
veri, ma **sabotare l'HTML** e guardare cosa intercetta. Cinque sabotaggi su cinque bloccati in
`fetch-probabili`, tre su tre in `fetch-voti`.

**Limite accettato**: se il sito riordinasse le celle dei voti lasciando ferme le intestazioni,
nessun controllo sul contenuto se ne accorgerebbe (ogni colonna resta internamente coerente).

## Fase 3 — i voti veri prendono il sopravvento (chiusa il 04/09)

I voti delle giornate già giocate si usano in due modi: (1) **mostrati accanto alla stima** nella
scheda giocatore (scarto solo da 4 giornate in su — su 2 partite una doppietta darebbe +8 e
sembrerebbe un modello rotto, quando è solo varianza); (2) **mescolati nella stima stessa**
(`mescola()`, `PESO_PRIOR_STAGIONE=10` — più alto del `B_PESO_PRIOR=15` dell'asta perché un
fantavoto oscilla più di un prezzo pagato, ma comunque serve tempo prima di fidarsi dei dati più
della stima).

`mvPura()`/`fantamediaStimata()` restano le stime pure, invariate — servono da prior e da
paragone onesto. `mvStimata()`/`fantamediaAttesa()` sono le versioni mescolate, quelle che il
resto dell'app chiama davvero (zero modifiche ai punti di chiamata).

Esempio verificato: Malen dopo G1+G2 (17.5 e 13.5, media 15.50) passa da 7.57 (pura) a 8.89
(mescolata, `(10×7.57 + 2×15.50)/12`).

`taratura.mjs` **non** deve testare le versioni mescolate — sarebbe circolare (confrontarle con
gli stessi voti che già contengono).

**Bug trovato dalla scansione di audit del 04/09** (indipendente, in parallelo): `caricaStorico()`
riscaricava OGNI giornata passata a ogni apertura (fino a 37 richieste a fine stagione), e il
risultato SOSTITUIVA lo storico salvato — un errore di rete cancellava dati già buoni in silenzio.
Corretto: ora si scarica solo ciò che manca e si somma, mai si riparte da zero.

## Modello 4 — la prossima partita, l'andamento, la condizione (04/09)

Richiesta esplicita, priorità dichiarata sopra ogni altra cosa in corso: bilanciare andamento
stagionale, prossima partita (casa/trasferta, avversario), condizione fisica.

**1. La prossima partita — `rettificaPartita()`**: prima non contava nulla per la scelta, solo
mostrata. Ora somma fattore campo (`CASA_BONUS=0.08`) e forza dell'avversario nel reparto che
conta (`ATT_SQUADRA` per P/D, `MV_SQUADRA` per C/A, scalato da `PESO_AVVERSARIO=1.4`). Si applica
in tre punti: `contributoAtteso()`, `simula()` (totale punti e voto del modificatore), scheda
giocatore. **Limite dichiarato**: costanti a intuito, non tarate — con 2-3 giornate non c'è ancora
campo a sufficienza.

Test di dominanza aggiornato di conseguenza (`prova-motore.mjs`): con `rettificaPartita()`, due
giocatori identici su certezza e resa possono finire ordinati diversamente per l'avversario —
comportamento voluto, verificato che la dominanza tiene su tutte e tre le dimensioni insieme.

**2. L'andamento in stagione**: `mediaPesataForma()` pesa ogni giornata con
`DECADIMENTO_FORMA=0.85` elevato a quante giornate fa è stata giocata (dimezza il peso ogni 4-5
giornate), condivisa fra voto puro e fantavoto coi bonus.

**3. La condizione fisica — `tassoSubentro()`**: usa il campo `subentrato` di ogni voto (entrato
dalla panchina invece di partire titolare), prima scartato. **Migrazione necessaria**: chi aveva
storico salvato senza quel campo lo riscarica una tantum. Uso deliberatamente conservativo: non
un segnale nuovo indipendente, ma un affinamento dello sconto già esistente su un titolare "in
dubbio" (scala fra 0.85 e 0.70), solo quando la fonte segnala già un dubbio.

Verificato dal vivo: Malen (casa contro Atalanta) 8.86→8.91; Svilar 5.46→5.49; Bernardeschi (casa
contro Sassuolo) 6.46→6.73, riga G1 con "(sub)" visibile in scheda.

## L'app impara dalla stagione — RETTIFICA_RUOLO (04/09)

Meccanismo scelto per essere trasparente e prudente, non un "impara da sola" opaco.
`tools/ricalibra.mjs` confronta la stima PURA con tutti i fantavoti reali scaricati finora, per
ruolo. Se lo scarto è abbastanza grande e il campione abbastanza ampio, aggiorna `RETTIFICA_RUOLO`
— un numero per ruolo, non un riadattamento di ogni costante. Scrive `dati/costanti.json`, letto
senza deploy.

**Tre reti di sicurezza**: `MIN_CAMPIONE=30` osservazioni per ruolo (sotto, non si tocca nulla);
correzione limitata a `LIMITE=0.4`; aggiornamento smorzato `TASSO_APPRENDIMENTO=0.3` (ogni giro si
sposta solo il 30% della distanza dall'obiettivo — verificato lanciando lo script tre volte:
portiere 0→0.071→0.120→0.155 verso 0.235, mai un balzo).

**Dove si applica**: dentro `fantamediaAttesa()`, sommata alla stima pura PRIMA della mescola col
rendimento del singolo giocatore — un prior migliorato che deve sfumare da solo per chi ha molti
dati propri (`mescola()` già lo fa gratis via `r.presenze`).

**Cosa NON corregge, deliberatamente**: `CASA_BONUS`/`PESO_AVVERSARIO` (serve un calendario
storico inesistente); `PESO_PRIOR_STAGIONE`/`DECADIMENTO_FORMA` (richiederebbe un vero backtest,
non solo un confronto scala-contro-scala); un resoconto "consigliato vs esito" (poi costruito il
09/09, vedi *Sette correzioni*).

## Le squadre imparano anche loro — MV_SQUADRA/ATT_SQUADRA operative (04/09)

Osservazione dell'agente, confermata dall'utente: la forza delle squadre (Modello 4) veniva
calcolata una volta sola dalle quotazioni di agosto e non si aggiornava mai — priorità dichiarata
dall'utente: *"l'obiettivo sarebbe costruirmi un oracolo da consultare [...] già dalla prossima
giornata"*, quindi non rimandato come gli altri due punti sopra.

`MV_SQUADRA_PURA`/`ATT_SQUADRA_PURA` restano il prior. `misuraGruppo()` applica
`mediaPesataForma()` a un GRUPPO di giocatori (portiere+difensori per `MV_SQUADRA`,
centrocampisti+attaccanti per `ATT_SQUADRA`). `aggiornaForzaSquadre()` mescola pura e misurata,
richiamata ogni volta che `STORICO` cambia (non solo all'avvio).

**Attenzione alla contaminazione**: `mvPura()`, `golSubitiAttesi()` e il ramo C/A di
`fantamediaStimata()` leggono esplicitamente le versioni `_PURA` — devono restare non toccate da
dati reali per lo stesso motivo di `fantamediaStimata()` stessa.

Verificato dal vivo: dopo G1+G2, Atalanta passa da "nella media" a "difesa forte" e "attacco
forte" su entrambe le fasi; Malen (Roma, casa contro Atalanta) passa da +0.05 a -0.01; Svilar da
quasi nullo a -0.37.

## Esplorazione grafica in Figma (04/09)

Ricostruiti in Figma campo, testata, tab, KPI e righe rosa, fedeli ai valori CSS veri. **Esito
onesto**: un solo miglioramento reale trovato (ombra più marcata sulle tessere del campo, già in
`main`) — testata/tab/KPI/righe rosa uscite visivamente identiche all'app esistente.

**Lezione**: il sistema di token di questa app è già disciplinato. Senza un brief di redesign vero
(nuova palette, riferimenti, cambio di direzione deciso a monte), un altro giro di "prova a
migliorare quello che c'è" probabilmente non trova granché.

**File Figma temporaneo da cancellare a mano**: `fwGN5XlGMed48p5I0znDU6`. Nessun tool di
cancellazione file Figma disponibile; stato mai confermato dall'utente.

## Cadenza degli aggiornamenti, seconda revisione (05/09)

**Confermato che leggere più spesso non costa niente**: repository pubblico → Actions gratis e
senza limite; i dati arrivano leggendo direttamente da GitHub, non via deploy Netlify. L'unico
limite reale è la cortesia verso fantacalcio.it (User-Agent dichiarato, niente raffiche).

Su questa base: lunedì/martedì scaricano i voti del turno appena concluso (mattina e sera);
mercoledì 2 giri, giovedì 5, venerdì un giro all'ora. **Turno infrasettimanale**:
`tools/invia-promemoria.mjs` lo riconosce da solo (guarda il giorno della prima partita) e manda
un promemoria diverso; il martedì diventa da solo orario quando serve
(`tools/turno-infrasettimanale.mjs`).

**Audit dello stesso giorno, due correzioni reali**:
1. La classificazione "infrasettimanale" guardava solo la prima partita del turno (un weekend con
   anticipo di giovedì risultava erroneamente infrasettimanale). Guardare l'ultima partita era
   PEGGIORE (G3, weekend normale che chiude di lunedì sera, sarebbe risultata infrasettimanale).
   Regola giusta, verificata su tre casi: infrasettimanale solo se **nessuna** partita cade
   venerdì/sabato/domenica.
2. Un turno infrasettimanale infilato in mezzo poteva far perdere per sempre i voti di un'altra
   giornata (lo scraper calcolava "giornata nelle probabili meno uno": con due giornate concluse
   nella stessa settimana, la più vecchia non veniva mai più ritentata). Sistemato: ora si
   scorrono tutte le giornate da 1 all'ultima conclusa, riprovando solo quelle il cui file manca.
3. Limite non risolto (rischio giudicato basso): un turno infrasettimanale che iniziasse lunedì
   mattina prestissimo avrebbe il primo avviso a ridosso della partita (mai capitato).
4. Fuori scope per ora: il cambio ora legale/solare di fine ottobre sposta di un'ora gli orari nei
   cron — da rivedere quando ci si arriva.

## Dettaglio grezzo in STORICO (05/09)

`caricaStorico()` salvava solo voto/fantavoto/senzaVoto/subentrato, scartando gol/assist/rigori/
autogol/gol subiti/ammonizione che lo scraper scarica già. Ora finisce anche questo in `STORICO`
(stessa migrazione una tantum di `subentrato`). **Deliberatamente non usato ancora da nessun
calcolo** — oggi 2 giornate erano troppo poche per distinguere segnale da rumore (vedi *Da fare*
in CLAUDE.md). Non tocca `estrai-motore.mjs` (il motore puro non ha mai letto `STORICO`).

## Manovrabilità da smartphone (05/09)

Richiesta esplicita: gesti, tasto indietro, attenzione alla batteria. Tutto verificato dal vivo in
emulazione mobile (375×812, touch).

**Tasto/gesto indietro chiude la sheet aperta, non esce dall'app**: `history.pushState` finta
all'apertura di una sheet, consumata da `popstate`. **Bug preso prima di spedirlo**: quattro punti
passavano `chiudiSheet` direttamente come callback di click, ricevendo l'oggetto `Event` come
primo argomento (sempre "vero") — il controllo `daIndietro !== true` risolve, solo `popstate`
passa il booleano letterale.

**Swipe in basso sulla maniglia per chiudere**: solo dalla maniglia, non dal resto della sheet
(deve restare scorribile). Sotto il 28% dell'altezza scatta indietro, sopra chiude.

**Swipe orizzontale fra Campo/Rosa/Moduli**: nei primi 10px si decide UNA volta se il gesto è più
orizzontale o verticale, mai si cambia idea dopo. Ignorato per mouse.

**Pull-to-refresh**: parte solo se il contenuto è già scrollato in cima. L'indicatore è un
fratello di `<main>`, non un figlio (altrimenti sparirebbe a ogni `render()`).

**Aggiornamento solo quando l'app torna in primo piano** (`visibilitychange`, non un timer in
sottofondo): per un'app che si apre una volta a settimana, un timer costerebbe sempre per un
guadagno quasi sempre nullo. **Deliberatamente NESSUN Wake Lock**: non è un'app da tenere aperta a
schermo acceso per minuti.

**Costruito e tolto lo stesso giorno: la vibrazione** — l'utente ha chiesto di toglierla appena
vista la lista, rimossa insieme a tutti i punti di chiamata.

**Verificato con eventi `PointerEvent` sintetici** via `javascript_tool` (il browser di prova non
renderizzava sempre il pannello per i click a coordinate) — prova che la logica reagisce, non la
sensazione al tatto reale, mai testata qui.

## Il bug di concorrenza in caricaStorico() (15/09)

Trovato costruendo l'indicatore "in forma"/"in calo" (vedi CLAUDE.md → *Come funziona il motore*):
`note` (l'insieme delle giornate già presenti in STORICO) si calcola una volta sola all'inizio
della funzione. Due chiamate partite quasi insieme — `visibilitychange` che scatta più volte,
"Aggiorna" premuto mentre l'avvio sta ancora caricando — si vedevano a vicenda uno STORICO senza
le giornate che l'altra stava ancora scaricando, e finivano per riscaricarle e appenderle una
seconda volta. Scoperto con Frattesi triplicato su G3/G4 in una prova, che falsava
`mediaPesataForma()` (media pesata su 9 voci invece di 4) abbastanza da nascondere lo scarto che
l'indicatore doveva segnalare.

Corretto con un lucchetto (`storicoInCorso`): una seconda chiamata aspetta quella già in corso
invece di partirne una per conto suo. Aggiunta anche una pulizia difensiva (una sola voce per
giornata) per chi avesse già duplicati salvati da prima di questo fix.

## Diagnosi mirata sulla rosa dell'utente, non su tutto il listone (15/09)

L'utente aveva segnalato una formazione "scandalosamente sbagliata" in una giornata, senza dire
quale giocatore. Prima ipotesi (sbagliata): Malen, lo scarto più grande di `taratura.mjs` su
tutto il listone — l'utente non lo ha mai posseduto, quindi non era lui il caso lamentato.
Corretto il metodo: filtrare la stessa diagnostica solo sui 25 giocatori della rosa vera (salvata
in CLAUDE.md → *La rosa dell'utente*), non sui 530 del listone intero.

**Trovato**: Frattesi (C, Lazio) lo scarto peggiore *della sua rosa* — stima pura 6.61, reale
9.13 su 4 giornate (tre gol in tre presenze, un vero exploit). Controllato a mano il perché: il
listone lo classificava già al 92° percentile dei centrocampisti (quasi il massimo bonus
possibile per la curva), quindi non è un dato scadente o un tag mancante — è che nessuna stima
percentile-based, calibrata su una stagione tipica, può prevedere una striscia di forma così
estrema. Altri scarti reali nella sua rosa: Esposito F.P., Vergara, Bisseck sottostimati;
Vlasic, Zambo Anguissa sovrastimati (quest'ultimo un rigorista/piazzati che non ha ancora reso).

Con `PESO_PRIOR_STAGIONE` lasciato intoccato su richiesta esplicita dell'utente ("non ho Malen,
di certo non era lui il problema... lasciamo così il peso prior iniziale, vediamo di intervenire
su altro"), la strada scelta è stata duplice: l'indicatore "in forma"/"in calo" (sopra) per la
trasparenza immediata, e `RETTIFICA_PIAZZATI` (sotto) per la parte strutturale isolabile.

## RETTIFICA_PIAZZATI — il bonus dei rigoristi tarato sui dati veri (15/09)

Estensione di `tools/ricalibra.mjs`, stesso schema di sicurezza di `RETTIFICA_RUOLO` (soglia
minima di campione `MIN_CAMPIONE=30`, correzione limitata `LIMITE=0.4`, aggiornamento smorzato
`TASSO_APPRENDIMENTO=0.3`), ma sul bonus dei piazzati invece che sulla fantamedia di ruolo.

**Il segnale**: per ogni giocatore con tag `R1`/`R2`/`R3` sul listone (rigorista di 1ª/2ª/3ª
scelta), si calcola il bonus rigori REALMENTE ottenuto in ogni giornata —
`rigoriSegnati*3 - rigoriSbagliati*3`, gli stessi pesi di `tools/fetch-voti.mjs` (non importabile
da lì: farebbe partire lo scraper vero al solo caricamento del modulo, essendo scritto per girare
da riga di comando — duplicazione accettata, stesso compromesso già fatto per
`parseDataPartita`/`tools/calendario.mjs`). La media reale (che include tutte le giornate senza
rigori, non solo quelle con un tentativo — è così che si arriva a un numero come "0.2 rigori a
partita" invece di sovrastimare) si confronta con `BONUS_PIAZZATI[tag]`, e lo scarto sistematico
si corregge come per `RETTIFICA_RUOLO`.

**Punizioni (`P1`/`P2`/`P3`) escluse deliberatamente**: un gol su punizione finisce dentro il
campo generico `gol` nei dati scaricati, non c'è modo di isolarlo dai gol normali. Calibrarle
richiederebbe una fonte diversa (non decisa, non urgente).

**Dove si applica**: come `RETTIFICA_RUOLO`, dentro `fantamediaAttesa()` — mai dentro
`fantamediaStimata()` (deve restare pura per `taratura.mjs`) — tramite una nuova funzione
`correzionePiazzati(p)` che somma le correzioni di tutti i tag presenti in `p.pz`. Aggiunta anche
al fingerprint di `classificaModuli()` (`chiaveModuli()`): cambia la scelta della formazione
quanto `RETTIFICA_RUOLO`, quindi deve invalidare la cache allo stesso modo.

**Primo giro reale, su G1-5**: `R1` passa da 0.400 a **-0.120** (65 osservazioni: il bonus rigori
osservato finora fra i rigoristi titolari è quasi nullo, non i 0.40 attesi a intuito). `R2`/`R3`
restano a zero: zero rigori tentati finora dai rigoristi di riserva, e comunque sotto la soglia
minima di campione. Non è detto che regga a lungo — è esattamente il tipo di correzione pensata
per aggiustarsi da sola giornata dopo giornata, non un numero definitivo.

**Estensioni tecniche minori per farlo funzionare**: `tools/estrai-motore.mjs` ora espone anche
`BONUS_PIAZZATI` (serviva a `ricalibra.mjs` per calcolare lo scarto, prima non era nel `return`);
`tools/prova-motore.mjs` aggiornato con i pezzi mancanti (`RETTIFICA_PIAZZATI`,
`correzionePiazzati`) per continuare a costruire un ambiente di prova completo — si è rotto una
volta con un `ReferenceError` finché non sono stati aggiunti, buon promemoria che ogni nuova
funzione richiamata da `fantamediaAttesa()` va aggiunta anche lì.

Verificato: `controlla.mjs`, `prova-motore.mjs` (tutte le invarianti, incluso il fix per i pezzi
mancanti), `taratura.mjs` (invariato, non tocca la stima pura — come deve essere).

## Bug: i promemoria scaglionati non partivano mai (15/09/2026)

**Segnalato dall'utente**: "la settimana scorsa non mi ricordo di averne ricevute". Controllo
richiesto esplicitamente, non un sospetto mio.

**Diagnosi**: `dati/scadenza-promemoria.json` (stato della giornata 4, sei commit fra il 10/09 e
il 12/09) mostrava tutte e sei le soglie — 24h/12h/6h/2h/1h/30m — marcate `"saltata"`. Nessuna
spedita. Controllate le esecuzioni reali del workflow via API pubblica GitHub
(`api.github.com/.../actions/workflows/.../runs`, il repo è pubblico quindi niente `gh auth`
serviva): il cron dichiara `*/15 * * * *` ma i gap reali fra un'esecuzione e la successiva erano
di **2-6 ore**, non 15 minuti — coerente su decine di run consecutivi, non un'anomalia isolata.
È un limite noto (non documentato in modo ovvio) degli scheduled workflow GitHub su repository
non enterprise: il cron è un tentativo, non una garanzia, e per cron ad alta frequenza lo scarto
può essere enorme.

**La causa del silenzio totale**: `promemoria-scadenza.mjs` scartava come `"saltata"` qualunque
soglia trovata scaduta da più di `FINESTRA_MIN=20` minuti rispetto al suo momento nominale —
pensato per un cron reale da 15 minuti, dove un ritardo oltre i 20 minuti sarebbe stata
un'anomalia. Con gap reali di ore, **ogni singola soglia** arrivava sempre oltre quella finestra:
la funzione scartava tutto, sempre, per costruzione — non un bug che si manifesta a volte, un
meccanismo che non poteva mai funzionare nelle condizioni vere del cron GitHub.

**Fix**: tolta la finestra fissa di 20 minuti. L'unico motivo per rinunciare ora è che la
scadenza vera e propria (non la soglia nominale) sia già passata — in quel caso il promemoria
non serve più comunque. Il messaggio inviato non usa più l'etichetta nominale della soglia
scattata (`"mancano 24 ore"`, `"mancano 12 ore"`, ecc.), che con ritardi di ore sarebbe stata
falsa, ma calcola il tempo VERO rimasto alla scadenza al momento dell'invio
(`formattaTempoRimanente`). Una soglia in ritardo di 5 ore che dichiarava "24h" ora dichiara
correttamente le ore vere rimaste.

**Non verificato**: se l'abbonamento push (`PUSH_SUBSCRIPTION`) sia ancora valido — nessuna delle
sei soglie della giornata 4 era arrivata al punto di provare a spedire, quindi non c'è
un'evidenza diretta né di un abbonamento scaduto né di uno funzionante. Il primo test vero sarà
la scadenza della giornata 5 (prima partita venerdì 18/09 20:45): se anche con il fix non arriva
nulla, il sospetto successivo è l'abbonamento (va ri-registrato dall'app, non è un problema di
codice).

**Occasione, non ancora fatta**: la stessa inaffidabilità del cron probabilmente riguarda anche
`dati.yml` (probabili/voti/ricalibrazione) — non misurata in dettaglio in questa sessione, solo
segnalata come sospetto in *Problemi aperti* di CLAUDE.md.

## Sessione notturna: cadenza di dati.yml, revisione del motore (15-16/09/2026)

Lavoro autonomo, autorizzato esplicitamente dall'utente per una notte intera ("ti autorizzo a
fare tutti i comandi necessari"), con un solo `git push`/merge alla fine, non prima.

**`dati.yml`: misurata la stessa inaffidabilità del cron, con un metodo più rigoroso di quello
usato su `promemoria.yml`.** Il cron di `dati.yml` è dichiarato *sparso apposta* (rispetto verso
fantacalcio.it, mai più di una lettura all'ora, mai di notte — vedi il commento in testa al
file), quindi il confronto naïf "gap fra un run e il successivo" fatto su `promemoria.yml` non
si applica tale e quale: un gap di 12 ore fra le 21:00 di lunedì e le 09:00 di martedì è voluto,
non un guasto. Il confronto giusto è contro gli **slot esattamente dichiarati** nelle sette
righe di cron (giorno per giorno, ora per ora), non contro il run precedente.

Fatto con l'API pubblica GitHub (`actions/workflows/349698350/runs`, 100 run più recenti,
nessun token — repo pubblico): generati tutti gli slot attesi dal 04/09 a oggi (71 slot),
cercato per ciascuno il run reale più vicino entro 6 ore. Risultato:
- **31 slot su 71 (44%) senza nessun run entro 6 ore** — non semplicemente "in ritardo", proprio
  assenti.
- Fra gli slot coperti, **ritardo mediano 165 minuti**, l'80% oltre 60 minuti, il 43% oltre le 3
  ore rispetto all'orario dichiarato.
- **Un giorno intero saltato del tutto**: lunedì 07/09, zero run né alle 07:00 né alle 19:00 UTC
  — proprio i due giri dedicati a scaricare i VOTI del turno appena concluso.
- Un run con `conclusion=failure` (14/09 22:14 UTC): verificato che precede il commit
  `67503df` (15/09 14:51 CEST, il fix `!cancelled()` già raccontato sopra) — stessa causa già
  diagnosticata, non un problema nuovo.

**Non è una perdita di dati, solo un ritardo.** Il passo "Voti delle giornate concluse" in
`dati.yml` non scarica solo l'ultima giornata: scorre tutte le giornate da 1 in su e riprova
quelle il cui file `dati/voti-N.json` manca ancora sul disco (`SI RIPROVA OGNI GIORNATA
MANCANTE`, vedi il commento nel file). Quindi un lunedì saltato del tutto non perde la giornata:
la recupera in automatico al primo run riuscito successivo, solo più tardi del previsto.

**Non toccato stanotte**: il limite è della piattaforma (GitHub throttla i cron degli scheduled
workflow, soprattutto quelli ad alta frequenza, su base "best effort" — non documentato in modo
esplicito ma osservato qui su due workflow diversi, con pattern diverso ma stessa causa). Una
correzione vera richiederebbe un innesco esterno più affidabile (es. un cron su un servizio
terzo che chiama `workflow_dispatch` via API) — infrastruttura nuova, un token con permessi di
scrittura da conservare da qualche parte: una decisione da discutere con l'utente, non presa a
cuor leggero durante una notte non supervisionata.

**Revisione avversaria del motore in `index.html`** (stesso metodo che il 03-04/09 aveva trovato
11 bug reali: "sabotare l'input e vedere cosa intercetta"). Letto per intero il blocco
`<script>` (righe 442-2570): `certezza()`, `fantamediaStimata()`/`fantamediaAttesa()`,
`rettificaPartita()`, `scegliUndici()`/`simula()`/`classificaModuli()`, import/export rosa,
notifiche push, gesti touch, countdown. Un solo candidato inseguito a fondo — in `certezza()`,
il boost `SUBENTRO` (riga 849) si applica con un controllo (`d.prob && !d.prob.titolare`) non
esplicitamente legato al ramo che ha calcolato `p`, quindi in teoria potrebbe superare il tetto
0.75 del ramo "nessun dato di giornata" se `d.prob` fosse presente mentre `d.squadraInCampo` è
falso. **Verificato e scartato**: in `tools/fetch-probabili.mjs` (righe 129-154) `squadre[...]`
e `giocatori[...]` si scrivono nello STESSO ciclo, carta-squadra per carta-squadra — non possono
divergere all'interno di un file scaricato con successo, e l'oggetto `PROB` viene sempre
sostituito per intero, mai unito con quello vecchio. Lo scenario non è raggiungibile dalla
pipeline reale: nessuna modifica.

**Esito onesto: nessun bug nuovo confermato nel motore.** Il codice regge bene a un giro di
lettura avversaria mirata — probabilmente perché la revisione precedente (03-04/09) e il fix di
v0.3 (il bug del "certezza * (fantamedia - 6)") avevano già ripulito i casi più gravi. Controllati
anche `sw.js` e `netlify/functions/schierato.mjs`: nessun problema. Verificato dal vivo (server
locale `tools/serve.mjs`, browser a 375px, dati reali già in `localStorage` da una sessione di
prova precedente): l'app renderizza tutto correttamente, countdown giusto, indicatori "in
forma"/"in calo" attivi, nessun errore in console.

**Aggiunto `.claude/launch.json`** (non esisteva): configura `tools/serve.mjs` come server di
sviluppo per il pannello di anteprima, per non doverlo riscoprire ogni sessione.

**Il merge finale ha trovato un doppio conteggio nella ricalibrazione di stanotte, e l'ha
corretto.** Mentre il lavoro andava avanti, la GitHub Action ha girato in autonomo su `main`
(commit `640d5eb`, 21:53 UTC — proprio uno degli slot in ritardo misurati sopra, arrivato con
quasi 3 ore di scarto sulle 19:00 dichiarate) e ha ricalcolato `dati/costanti.json` sugli stessi
dati G1-G4. Il merge di `dev` su `main` è quindi andato in conflitto su quel file: la versione su
`dev` (rilanciata a mano prima di stanotte, poi eseguita di nuovo per errore mentre si risolveva
un primo tentativo di merge) aveva convergito DUE volte sugli stessi dati anziché una, sballando
lo smorzamento (`TASSO_APPRENDIMENTO=0.3`) che serve apposta a non fidarsi troppo in fretta di
un singolo campione. Risolto tenendo il valore del run pulito — quello della CI di stanotte, che
per `rettificaRuolo` risulta *identico, cifra per cifra*, al primissimo giro fatto a mano nel
commit che ha introdotto `RETTIFICA_PIAZZATI` (`67b47d5`, prima di qualunque doppio conteggio):
conferma indipendente che era quello il valore corretto. Per `rettificaPiazzati` (che la CI di
stanotte non aveva ancora, girando su una versione dello script precedente al merge) ripreso lo
stesso commit pulito. **Lezione**: rilanciare uno script di calibrazione smorzata a mano, più di
una volta sugli stessi dati, non è innocuo — ogni giro in più è un passo di apprendimento vero,
non un semplice ricalcolo idempotente. Da qui in poi lasciarlo girare solo in CI, come già
previsto.

## Sessione del 26/09/2026: email "failed", promemoria in ritardo di 2 ore, ricalibrazione ripetuta

**Richiesta dell'utente**: "in questa settimana ho continuato a ricevere mail che le actions su
github erano fallite, puoi risolvere il problema e controllare anche tutto il resto?". Sessione
sul secondo clone (`C:\Code\fantacalcio`), senza `gh`: tutto via API pubblica GitHub con `curl`.
Utile e nuovo: `check-runs/<job_id>/annotations` risponde senza token (gli avvisi e l'errore
finale di ogni job); lo zip dei log invece vuole autenticazione anche su repo pubblico.

**Stato trovato**: `main` locale con un commit di diario mai pushato (16/09, rimesso sopra
`origin/main` con un rebase, poi `dev` portato allo stesso punto). Su `origin/main` 26 commit
nuovi della Action. `promemoria.yml` sempre verde; `dati.yml` rosso a ogni giro dal 21/09
13:32 UTC, tranne i giri extra del martedì (che non scaricano nulla).

### 1. Le email: un vuoto vero scambiato per un guasto

Dai passi del job (API `runs/<id>/jobs`): fallisce sempre "Probabili formazioni", "fonte di
riserva" riesce, tutto il resto gira e committa. Riprodotto in locale con
`fetch-probabili.mjs --prova`: 20 squadre, 484 giocatori, 59 indisponibili, **0 ballottaggi** →
"nessun ballottaggio trovato: la sezione non e stata letta". La pagina vera invece ha tutte e 10
le `<section class="ballots">`, con `<span class="empty-list-message">Nessun ballottaggio</span>`
per ognuna delle 20 squadre: la G6 si gioca il 10-12/10 (sosta per le nazionali) e a tre
settimane dalla partita la redazione non ne ha nessuno. Storico del file: fino al 20/09 la fonte
principale trovava sempre 16-49 ballottaggi, quindi il controllo non era mai scattato prima.

Effetto collaterale, più importante delle email: per tutta la settimana l'app ha girato sui dati
della fonte di riserva — 215 giocatori (solo titolari) invece di 484, nessun modulo, nessuna
panchina, nessun ballottaggio. L'app li regge (`PROB.ballottaggi||[]`), e con la G6 lontana non
ha fatto danni, ma è esattamente il degrado silenzioso che la validazione doveva evitare. Notato
anche: la riserva restituisce percentuali che oscillano da un giro all'altro (82 → 73 → 82 per lo
stesso giocatore), quindi quando è in uso committa a ogni giro.

**Fix** (`85e071e`): `estrai()` conta anche le sezioni ballottaggi trovate e le squadre che
dichiarano "Nessun ballottaggio" (in un oggetto `controlli`, non nel file scritto). Lo zero passa
solo se la sezione c'è in ogni partita e tutte le squadre dichiarano di non averne. Sabotaggi sulla
pagina vera salvata (con un harness che toglie `main()` dallo script e ne esporta le funzioni):
sezione rinominata ovunque, in una sola partita, scritta "vuota" rinominata, un ballottaggio vero
con `ballot-list` rinominato, con `<li class="dot` rinominato → **5 su 5 bloccati**; pagina vera e
un ballottaggio vero con il markup atteso → passano. Poi `--prova` contro il sito vero: passa.

### 2. I promemoria partivano 2 ore in ritardo (in CI, da sempre)

Guardando `dati/scadenza-promemoria.json` della G5 (primo test sul campo del fix del 15/09): 24h,
12h, 6h, 2h spediti, 1h e 30m "saltata". Ma il "2h" risultava spedito alle 19:52 UTC, e la prima
partita (Monza-Sassuolo, venerdì 18/09 alle 20:45 italiane) cominciava alle 18:45 UTC.

Causa: `parseData()` in `tools/calendario.mjs` usava `new Date(anno, mese, giorno, ore, minuti)`,
cioè il fuso del processo. Sul PC di casa è l'ora italiana e tutti i test del 04-09/09 tornavano;
sui runner GitHub è UTC, quindi ogni orario risultava 2 ore più tardi. **Prova**: rigiocata la
logica di `promemoria-scadenza.mjs` sugli orari veri dei run di `promemoria.yml` (API) col parser
vecchio e il processo in UTC → riproduce *esattamente* il file della G5: "2h" alle 19:52 con
"mancano 48 minuti" quando la formazione era scaduta da 72 minuti, e un "6h" alle 17:26 che diceva
"mancano 3 ore" quando ne mancava una. Sbagliato di 2 ore anche l'orario scritto dentro le
notifiche (sia qui sia in `invia-promemoria.mjs`: "si comincia ... alle 17:00" per una partita
delle 15:00). Stessi orari veri col parser nuovo: 24h/12h/6h/2h tutti prima della scadenza, con i
minuti giusti.

**Fix** (`bf0ab6d`): l'ora del sito si converte da Europe/Rome esplicitamente (`daOraRoma()`,
scarto letto con `Intl.DateTimeFormat`, secondo giro per i giorni del cambio d'ora). Provato con il
processo in UTC, Europe/Rome, America/New_York e Asia/Tokyo, su ora legale, solare, 25/10, 28/03 e
capodanno: stesso istante giusto ovunque (il vecchio era giusto solo in Europe/Rome). Trappola nel
provarlo: su Windows Node ignora `TZ=America/New_York` passato da Git Bash (UTC invece funziona) —
il fuso va impostato con `process.env.TZ` dentro il processo. `parseDataPartita()` in `index.html`
non toccata: gira sul telefono, che è in Italia.

### 3. La ricalibrazione faceva quattro passi a settimana

`dati/costanti.json` riscritto 4 volte fra il 21 e il 22/09 sugli stessi voti G1-G5 (correzione A
0.236 → 0.261 → 0.278 → 0.290 → 0.299): `dati.yml` lancia `ricalibra.mjs` a ogni giro di lunedì e
martedì, e ogni lancio è un passo smorzato in più. Lo stesso doppio conteggio già visto la notte
15-16/09, ma sistematico.

**Fix** (`971eba2`): se le giornate di voti in `dati/` sono le stesse di `giornateUsate`
nell'ultimo `costanti.json`, esce senza scrivere. Lanciato due volte sugli stessi voti: file
identico (hash).

**Costanti rigenerate** (`390a59d`) con un replay: copia temporanea di `index.html` + `tools/` +
`dati/probabili.json`, poi `voti-1..2`, `+3`, `+4`, `+5` aggiunti uno alla volta, lanciando il
`ricalibra.mjs` corretto dopo ciascuno — il codice vero, nessuna logica ricopiata. I primi tre
passi riproducono **cifra per cifra** i valori scritti dalla CI il 04/09 (G1-2), 14/09 (G1-3) e
15/09 12:24 (G1-4): conferma che finché funzionava faceva proprio un passo per arrivo. Risultato
su G1-G5: `rettificaRuolo` P 0.071, D 0.044, C 0.018, A 0.225 (erano 0.098/0.051/0.046/0.299);
`rettificaPiazzati` R1 -0.200, R2 -0.058, R3 -0.017.

**Corretta una nota del 16/09**: il valore tenuto allora come "primo giro pulito" su G1-G4 (A
0.236, commit `67b47d5`/`640d5eb`) era già il *secondo* passo — tutti e due partivano da A 0.185,
scritto dalla CI il 15/09 alle 12:24. Senza conseguenze ora: le costanti sono ricostruite da zero.

### 4. Trovato e NON corretto: la formula dei piazzati converge a metà

In `ricalibra.mjs` lo scarto dei piazzati è `osservato - (BONUS_PIAZZATI + correzione precedente)`,
e la correzione si avvicina a quello. Il punto fisso è `(osservato - base)/2`: metà dello scarto
vero (per `RETTIFICA_RUOLO` no, perché lì lo scarto si misura contro la stima pura). Provata la
versione corretta nel replay: R1 -0.304 invece di -0.200. Però andando a vedere chi ha tirato i
rigori: in tutta la A, su G1-G5, **5 rigori** (0 in G1-G3); fra i rigoristi R1, Colombo ne ha
sbagliato uno e Zaccagni segnato uno (+3 -3 = bonus osservato esattamente 0.000 su 79 presenze).
La soglia `MIN_CAMPIONE=30` conta presenze, non rigori: la correzione si muove su due eventi.
Correggere solo la formula renderebbe più aggressiva una correzione guidata dal rumore; oggi la
"metà per errore" fa da freno. **Lasciato com'è, con un commento nel codice, decisione
all'utente** — proposta: formula corretta + soglia minima sui rigori tirati.

### 5. Il resto

- **Avvisi su ogni run**: `actions/checkout@v4` e `setup-node@v4` su Node 20 (deprecato, già
  forzato a Node 24). Passati a v6 (`3fd7d24`): Node 24, nessuna cache automatica (niente
  `packageManager` in `package.json`), `git push` invariato. Esistono le v7 (luglio 2026), scelte
  le v6, più collaudate: nessuna differenza che conti qui. Parse YAML vero (PyYAML) di entrambi i
  workflow dopo la modifica. Altro avviso, solo informativo: `ubuntu-latest` passa a Ubuntu 26
  dal 19/10.
- **Commento vecchio** in `promemoria.yml` (parlava ancora della finestra di 20 minuti tolta il
  15/09): aggiornato, più la nota sul fuso.
- **Facoltativo** (`1409c1f`, commit a parte apposta): `netlify.toml` esclude anche `tools/**` e
  `.github/**` dal deploy. Provato con `git diff --quiet` sui commit veri: i fix di questa
  sessione senza quel file → deploy saltato; il commit dell'indicatore "in forma" (`index.html`)
  → deploy.
- **Controlli**: `controlla.mjs origin/main` pulito (`index.html` non toccato), `prova-motore.mjs`
  tutte le invarianti, `taratura.mjs` (A sottostimati di 0.30, coerente con la correzione A),
  `turno-infrasettimanale.mjs` e i due promemoria senza secret → escono puliti.
- **Non verificabile da qui**: il sito Netlify e la funzione `schierato` (l'URL sta solo nella
  variabile GitHub `NETLIFY_SITE_URL`, non nel repository).

**Tutto su `dev`, non pushato**: regola della memoria "fermarsi prima del push nei batch". Il
merge su `main` fa un deploy Netlify (tocca `tools/`, `.github/`, `netlify.toml`).
