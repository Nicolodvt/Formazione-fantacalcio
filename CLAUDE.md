# App Formazione — Diario di bordo

**Stato: v0.3 (04/09/2026).** Fasi 0, 1 e 2 chiuse, Fase 3 avviata. L'app schiera, sceglie il
modulo, funziona offline; la GitHub Action scarica probabili e voti da sola. **Non è ancora online
su Netlify** — una nota precedente lo dava per fatto, era sbagliata: l'utente non se lo ricordava e
non c'è nessuna traccia di un deploy reale. Resta da fare, apposta, a lavoro finito (vedi
*Aggiornamenti e crediti Netlify* sotto). Traguardo: **4ª giornata**.

Progetto separato dall'app asta, che vive nella cartella superiore. Quella serve a *comprare* ed è
finita lunedì; questa serve a *schierare* e deve reggere 38 giornate.

## ⚠️ Regola di lavoro corrente: si sviluppa su `dev`, non su `main`

**Dal 04/09/2026, dopo l'incidente dei crediti Netlify.** `main` è collegato in continuous
deployment: ogni push ci fa partire una build di produzione, e GitHub Actions ha una quota
mensile di minuti. Una notte di lavoro autonomo in loop ha fatto push ripetuti su `main` a ogni
piccolo commit, bruciando **150 crediti Netlify in poche ore**. I build di produzione sono stati
**fermati manualmente** dall'utente.

Finché non viene tolta esplicitamente, vale questa regola:
- Si lavora **sempre su branch `dev`**, mai commit diretti su `main`.
- Push su `dev` solo a fine sessione o a milestone, non ad ogni modifica.
- **Mai** mergiare `dev` → `main`, **mai** riattivare i build Netlify, **mai**
  `netlify deploy`/login/config, **mai** push su `main` — nemmeno per "provare online" — senza
  che l'utente lo chieda esplicitamente *in quella sessione*. Un'autorizzazione data prima non
  vale più dopo questa nota.
- Quando l'utente dice di essere pronto a pubblicare: merge `dev` → `main`, poi si decide insieme
  se riattivare i build automatici o fare un deploy manuale singolo.

## Aggiornamenti e crediti Netlify (04/09/2026)

**Problema individuato prima di collegare Netlify, non dopo.** La Action scrive su `dati/` fino a
7 volte a settimana (vedi orari sotto). Con un collegamento Netlify normale (continuous deployment
sul push), **ognuna di quelle scritture pubblicherebbe il sito**: non un rischio di un'altra notte
fuori controllo, ma il comportamento strutturale e permanente del collegamento standard, ogni
settimana, per sempre. L'utente ha fatto bene a fermarsi a chiederlo prima di collegare qualcosa.

**Soluzione: i dati non passano più da un deploy per raggiungere il telefono.**
`fetchDati()` in `index.html` prova prima a leggere `dati/*.json` **direttamente da GitHub**
(gratis, istantaneo, nessuna build coinvolta) e solo se GitHub non risponde ripiega sulla copia
locale pubblicata con l'app — che resta comunque come rete di sicurezza, mai rimossa. `sw.js`
precarica anche la copia GitHub per l'offline.

**Condizione: il repository deve essere pubblico.** Deciso in chat il 04/09 — niente di sensibile
dentro (formazioni Serie A pubbliche, nessuna password). Finché resta privato GitHub risponde 404 e
l'app usa semplicemente il ripiego locale: nessuna rottura, solo nessun guadagno finché non si
rende pubblico. **Da fare (manuale, è un cambio di impostazioni dell'account, non lo faccio io):**
Settings del repo su GitHub → Danger Zone → *Change visibility* → *Make public*.

**Rete di sicurezza aggiuntiva**, anche a prescindere dal punto sopra: `netlify.toml` ha un
`ignore` che salta il deploy se rispetto all'ultimo pubblicato cambia solo dentro `dati/` o solo un
file `.md`. Vale anche se in futuro qualcosa touchasse per errore `main` con un commit solo-dati.

**Perché non l'API di Claude al posto dello scraper (chiesto e valutato il 04/09):** il costo dei
deploy non dipende da come arrivano i dati, solo da come li pubblichiamo — quindi non risolverebbe
niente qui. Sul merito, la pagina probabili è già scritta da fantacalcio.it in un formato ordinato:
leggerla è gratis e affidabile al 100%. Un'API a pagamento avrebbe senso per compiti di *giudizio*
che lo scraper strutturalmente non può fare (leggere un articolo di cronaca e dedurne un dubbio non
ancora nella pagina strutturata, scrivere il perché di un consiglio) — non per sostituire una
lettura di dati già pronti.

## Notifiche push (04/09/2026)

**Scelta dell'utente**, esplicitamente: notifica push vera, non un promemoria da calendario —
sapendo che significa più infrastruttura da costruire e mantenere, apposta per spingere i limiti
attuali del progetto. Implementato tutto tranne l'unico pezzo che richiede l'account
dell'utente stesso.

**Come funziona:**
- `index.html`, foglio Impostazioni → *Notifiche*: "Attiva promemoria" chiede il permesso al
  browser, iscrive il service worker al servizio push (chiave pubblica VAPID — pubblica per
  definizione, sta nel codice), poi mostra l'abbonamento come testo da copiare.
- Quell'abbonamento va incollato **una tantum** come secret GitHub `PUSH_SUBSCRIPTION`
  (repository → Settings → Secrets and variables → Actions). Deciso di NON costruire un server
  che lo salvi da solo (una funzione Netlify + storage): con un solo utente e un abbonamento che
  cambia raramente, un copia-incolla occasionale è più semplice di un pezzo di infrastruttura in
  più da mantenere — scelta coerente con "poche cose che si possono rompere in silenzio" già
  seguita nel resto del progetto.
- `tools/invia-promemoria.mjs`, dentro `.github/workflows/dati.yml` subito dopo il fetch delle
  probabili: trova la prima partita della giornata in `dati/probabili.json`, e se non ha già
  avvisato per quella giornata (il numero sta in `dati/promemoria.json`) spedisce un push con
  orario e avversari. Se i secret non sono impostati esce senza errore — è un extra sopra lo
  scraper, non deve poterlo rompere.
- `sw.js` gestisce `push` (mostra la notifica, un solo `tag` fisso così non se ne accumulano più
  di una) e `notificationclick` (riporta all'app).
- `web-push` (libreria npm, non l'ho scritta a mano: firma e cifra i messaggi secondo RFC8291,
  reinventarla da zero avrebbe significato crittografia scritta a mano per nessun guadagno) si
  scarica al volo nel workflow con `npm install --no-save` — niente `package.json`/lockfile nel
  repo, stessa scelta di dipendenza-zero già fatta per gli scraper.

**Chiavi VAPID**: generate localmente il 04/09 (`web-push` installato temporaneo, mai committato,
già in `.gitignore` via `node_modules/`). La pubblica è nel codice (`index.html` e
`invia-promemoria.mjs`, devono restare identiche — controllato). La privata **non è in nessun
file**: sta scritta nel diario dell'agente di quella sessione, resta da impostarla come secret
GitHub `VAPID_PRIVATE_KEY` quando l'utente torna al PC — se le chiavi si rigenerano mai, vanno
cambiate in entrambi i posti insieme o gli abbonamenti già fatti smettono di funzionare.

**Cosa NON è verificabile da qui**: il browser di questa sessione ha `Notification.permission`
già a `"denied"` di default (politica dell'ambiente sandbox), quindi il vero click "Attiva
promemoria" → notifica reale sul telefono non si può testare in questo ambiente. Verificato
invece tutto il resto: la gestione del permesso negato non rompe nulla (mostra un avviso, niente
crash — provato dal vivo), `tools/invia-promemoria.mjs` gira senza errori contro
`dati/probabili.json` vero (trova Genoa-Como venerdì 20:45, formatta "venerdì 4 settembre alle
ore 20:45"), gestisce correttamente sia i secret mancanti che un abbonamento non valido (provato
con un abbonamento finto: fallisce nel punto giusto, con l'errore giusto, senza scrivere il
marker di "già avvisato"). Stessa categoria del limite già dichiarato sul service worker
dell'asta: mai verificato su un telefono vero.

## File

- `index.html` — l'app. Single-file, stessa filosofia dell'asta: CSS in `<style>`, listone in
  `<script id="listone-data">`, logica in un unico IIFE. Nessuna dipendenza esterna.
- `manifest.webmanifest` + `sw.js` — installazione e funzionamento offline. Hanno effetto solo se
  la cartella è servita via http/https.
- `tools/fetch-probabili.mjs` — lo scraper. **Gira solo in CI, mai nel browser.**
- `dati/probabili.json` — output dello scraper. L'app lo legge **prima direttamente da GitHub**
  (`fetchDati()` in `index.html`), e solo se non risponde ripiega sulla copia locale pubblicata
  con l'app. Vedi *Aggiornamenti e crediti Netlify*.
- `.github/workflows/dati.yml` — il cron: probabili 7 volte a settimana (4 il venerdì, 2 il
  sabato, 1 la domenica — spostato sul venerdì il 04/09 su richiesta, prima erano 5 con un giro
  anche il giovedì), voti il martedì sera.
- `tools/fetch-voti.mjs` — scraper dei voti a giornata conclusa.
- `tools/taratura.mjs` — confronta le stime del modello con i fantavoti reali.
- `tools/controlla.mjs` — controllo di integrità, **da lanciare dopo ogni modifica**.

## La decisione che regge tutto: fetcher fuori dall'app

fantacalcio.it non manda header CORS. Un `index.html` aperto nel browser **non può** chiamarlo, né
può chiamare leghe.fantacalcio.it. Verificato anche che `fantacalcio.it/api/v1/Excel/votes/21/1`
risponde `401` senza account.

Quindi le due cose richieste — "single-file autosufficiente come l'asta" e "i dati arrivano da
soli" — non stanno insieme senza un pezzo che gira su un server. La soluzione è **separare chi
scarica da chi decide**:

```
GitHub Action (7×/sett.)  →  dati/probabili.json  →  app (fetch da GitHub, poi same-origin)
   fragile, sacrificabile        il contratto          stupida, autosufficiente
```

(Diagramma aggiornato il 04/09: il fetch legge prima da GitHub direttamente, non solo
same-origin — vedi *Aggiornamenti e crediti Netlify*. Il same-origin resta come ripiego.)

Conseguenze, tutte volute:
- **Nessuna credenziale nel browser.** Niente password in un file che chiunque guardi lo schermo
  può leggere.
- **Niente CORS**: il file è servito dalla stessa origine dell'app.
- **Offline funziona** (verificato, vedi sotto): il service worker cachea anche i dati.
- **Se il fetcher muore, l'app non muore.** Continua con l'ultimo file buono, *dichiarando* la data
  del dato, e lascia l'inserimento manuale come rete di sicurezza. Stessa disciplina del banner
  `#noSaveBar` dell'asta: degradare dicendolo.

**Sito Netlify separato da quello dell'asta.** Il `sw.js` dell'asta ha `scope:"./"`, strategia
network-first che cachea *ogni* GET e fallback a `./index.html`: servita dalla stessa origine,
questa app verrebbe intercettata e in offline mostrerebbe l'app asta.

## L'aggancio: id di fantacalcio.it (verificato)

**Gli `id` del listone dell'asta SONO gli id di fantacalcio.it.** Malen è `5585` nel listone e in
`fantacalcio.it/serie-a/squadre/roma/malen/5585`; Svilar è `5841` in entrambi.

Verifica su 480 giocatori estratti dalle probabili di G3:

| controllo | esito |
|---|---|
| trovati nel listone | 473 / 480 (98,5%) |
| squadra discordante | **0** |
| ruolo discordante | **0** |
| nome discordante | **0** |
| copertura dei giocatori con `score ≥ 50` | 195 / 204 (96%) |

**Non si incrociano mai i nomi.** Il listone scrive "Martinez L." dove il sito scrive "Lautaro
Martinez": inseguire i nomi sarebbe una sorgente infinita di errori silenziosi. Si usa solo l'id.

I 7 non trovati sono arrivi tardivi che il listone non ha (El Shaarawy, Rodriguez R., Ehizibue,
Konate A., Kulla, Pompei, Enem). Serviranno solo per il mercato di riparazione.

## Cosa dice la pagina delle probabili

HTML servito dal server, nessun JavaScript da eseguire per leggerlo. Struttura regolare:

- `class="matchweek"` → numero di giornata
- `<li class="match match-item">` → una partita; dentro, due `card team-card` (prima la casa)
- `class="h6 team-name"` / `class="h6 team-formation"` → squadra e modulo
- `player-list starters` / `player-list reserves` → 11 + 13
- per ogni giocatore: `data-status`, `class="role" data-value="p|d|c|a"`, `aria-valuenow` (la
  percentuale), link con l'id
- sezioni `suspendeds`, `injureds`, `dubts`, `cautioneds`, `ballots`

`data-championship-id="21"` = Serie A 2026/27. È lo stesso `21` dell'endpoint dei voti: servirà.

**Chi non compare nelle probabili non è un buco, è un'informazione.** Verificato: McTominay,
Orsolini e Zaniolo mancano dai 24 e sono tutti e tre in `injureds` con la motivazione. Quindi:
in probabili → si sa quanto è dato titolare; assente ma in `injureds`/`suspendeds` → si sa perché;
assente e basta → è fuori dai 24, non giocherà.

## Come funziona il motore

Due grandezze **tenute separate**, mai fuse in un numero solo: un fuoriclasse al 20% non è un
fuoriclasse, quella domenica, e un punteggio unico lo nasconderebbe.

- **certezza** — probabilità di prendere voto. Dalla percentuale delle probabili, corretta da
  squalifiche, infortuni e dubbi dichiarati dalla fonte.
- **resa** (`fantamediaAttesa`) — quanto vale quando gioca. Per P e D è la media voto ripresa
  dall'app asta; per C e A sono i bonus stimati dal percentile nel ruolo, più i piazzati.

Due cose imparate facendolo, che non erano ovvie:

- **Il subentro va sommato solo a chi non parte titolare.** Sommandolo a tutti, i titolari
  diventavano tutti 91% e la lista perdeva ogni informazione. Le riserve, invece, hanno una coda
  vera: entrare a mezz'ora dalla fine e prendere voto capita spesso, e 0.08 era troppo poco.
- **`data-status="warn"` ce l'hanno TUTTE le riserve** (260 su 260): è un dubbio dichiarato solo
  quando sta su un titolare (43 casi). Applicarlo a tutti significava penalizzare due volte.

**Limite dichiarato:** i bonus di C e A sono *stimati* dal percentile di valore, non misurati su
gol e assist reali. Servono a ordinare due attaccanti fra loro, non a prevedere il fantavoto di
domenica. La Fase 3 li sostituirà con i dati veri.

### Perché la scelta del modulo passa da una simulazione

Il modificatore di difesa **non è additivo**: si calcola su portiere + i 3 *migliori* difensori.
Quindi il quarto e il quinto difensore non alzano la media — fanno assicurazione. Un conto a
tavolino non lo vede e sceglierebbe sempre la difesa a 3, che concentra la qualità.

L'app sceglie l'undici in modo deterministico (leggibile, stabile a ogni ridisegno) e poi lo misura
su 1500 giornate simulate, con i cambi che entrano per ruolo come da regolamento. Da lì esce anche
**quanto spesso il modificatore non si applica affatto**: con due soli difensori affidabili salta
il 60% delle volte, e in quel caso l'app smette di chiamarlo "forte" — un modificatore alto che
salta non è un modificatore alto.

Verificato che con una difesa sana i moduli si equivalgono (modificatore fermo a 6.20-6.21), e che
con due difensori in dubbio conviene schierarne **meno**, non di più: così in campo vanno solo gli
affidabili e i dubbi restano in panchina, da dove possono comunque subentrare.

## Cosa è stato verificato davvero

| prova | esito |
|---|---|
| import export asta schema 1 | 25 su 25 agganciati |
| campo, rosa, moduli, scheda giocatore | funzionanti a 375px |
| **offline vero** (server spento, ricarica) | app completa dalla cache, dati inclusi |
| service worker su http | registrato e `activated` |
| dati mancanti | dichiara "Nessun dato", ripiega sul `titPct` del listone |
| dati vecchi di 6 giorni | avviso rosso esplicito, app che continua a funzionare |
| tutti e 7 i moduli a 375px | una riga per reparto, nessun overflow |

L'offline e il service worker sono le due cose che nell'app asta erano rimaste **non verificate**.
Qui lo sono, su http locale. Resta da provare sul telefono vero.

## Due difetti trovati solo guardandola

Nessuno dei due dava errore, e i controlli automatici li avevano lasciati passare:

1. **Tutti i giocatori a 91%.** Il subentro sommato anche ai titolari: un errore di modello, che si
   è visto perché la colonna era tutta uguale.
2. **Orario partita "01/01 01:00".** Nella pagina ci sono DUE `match-date` per partita e il primo è
   un segnaposto mai compilato (`startDate="1970-01-01"`). Ora si cerca dentro `match-info`, e una
   validazione blocca il segnaposto se ricapita.

È la conferma della regola ereditata: i controlli dicono che il codice c'è, non che è giusto.

## Correzione a un errore ereditato

Il CLAUDE.md dell'app asta, sotto *Limiti dichiarati*, sostiene che il listone "non corrisponde a
una Serie A reale" perché contiene Frosinone, Monza, Venezia e Sassuolo, e su quella premessa
scarta tutte le fonti esterne.

**È falso.** Sono esattamente le 20 squadre della Serie A 2026/27: Frosinone, Monza e Venezia sono
le promosse dalla B, Sassuolo era già in A. È questa correzione che rende possibile tutto il
progetto. Da sistemare anche in quel file, quando l'asta sarà passata.

## Strumenti

- `node tools/fetch-probabili.mjs` — scarica le probabili. `--prova` valida senza scrivere.
- `node tools/controlla.mjs [ref]` — confronta con un commit e dice cosa è **sparito** fra funzioni,
  listener, selettori CSS e id. È il controllo che sull'app asta avrebbe trovato subito i blocchi
  cancellati in silenzio. **Va lanciato dopo ogni modifica.**
- `node tools/serve.mjs` — server statico su :8099 per provare in locale (da `file://` il fetch dei
  dati non funziona).
- `tools/rosa-esempio.json` — una rosa finta in schema 1, per provare l'app prima dell'asta.

## Regole di lavoro ereditate dall'app asta

Valgono identiche qui, e sono state imparate sbagliando:

- **Dopo ogni modifica per intervallo**, oltre a `node --check`, lanciare `tools/controlla.mjs`.
  Una sostituzione "da qui a lì" può cancellare interi blocchi lasciando il codice sintatticamente
  valido.
- **Per il CSS** vale lo stesso: una regola persa non dà errore, l'elemento resta lì senza stile.
  `controlla.mjs` confronta anche i selettori.
- **Poi guardarla davvero, a 375px.** Entrambi i difetti veri di questa versione sono usciti da lì,
  non dai controlli.
- Qui in più c'è **git**, che l'app asta non ha: commit piccoli e frequenti.
- Attenzione a `node -e` dentro bash: i backtick nei template literal vengono interpretati dalla
  shell. Per le patch, scrivere lo script su file ed eseguirlo.

## Cosa è arrivato con la notte del 03→04/09

**Online (nota corretta il 04/09, era sbagliata: vedi sopra).** Repo creato su GitHub
(`Nicolodvt/Formazione-fantacalcio`). Il sito Netlify **non** è mai stato collegato — questa nota
lo dava per fatto, l'utente non se lo ricordava e non c'è traccia di un deploy reale da nessuna
parte. Il service worker era stato verificato `activated` durante un test locale via http, non su
un sito pubblicato davvero.

**Bersagli da dito.** Misurando l'area toccabile reale con `elementFromPoint` — non la dimensione
visiva — il pulsante impostazioni risultava 30×28 px contro i 44×44 della linea guida. Corretto
estendendo l'area oltre il bordo visibile con uno pseudo-elemento: tutto fra 44 e 46 px, testata
cresciuta di 6 px. Nessun controllo di sintassi l'avrebbe mai trovato.

**Scraper dei voti** (`tools/fetch-voti.mjs`), validato su G1 e G2. Due trappole disinnescate,
nessuna delle quali dava errore:
- Il sito pubblica **tre voti affiancati** (Redazione Fantacalcio, Statistico, Italia). La nostra
  lega usa il primo. Sbagliare colonna non avrebbe dato errore, solo uno storico falso: ora
  l'ordine viene verificato dalle icone di intestazione e lo script si ferma se cambia.
- **"Senza voto" è codificato con la sentinella 55**, non con una casella vuota. Preso per buono
  dava una media di giornata di 9.98. L'ha intercettato il controllo sulla media attesa.

**Il modello è tarato bene.** `tools/taratura.mjs` estrae le formule da `index.html` (non le
ricopia, così non possono divergere) e le confronta con i fantavoti reali di G1+G2 su 331
giocatori: media stimata **6.13** contro **6.14** reale, scarto massimo per reparto 0.17 sui
portieri. Le costanti `BONUS_MAX`, scelte a intuito, reggono al confronto col campo.
Sull'**ordinamento** due giornate non dicono nulla (Spearman 0.32) e le costanti **non** sono
state ritoccate: con n=2 si inseguirebbe il rumore. Da rifare dopo G5 e G10.

**`netlify.toml`** con no-cache su `sw.js`, `index.html`, manifest e `dati/*`. Evita il guaio più
insidioso delle PWA: un CDN che serve un service worker vecchio e un'app che non si aggiorna mai
più, senza che l'utente possa accorgersene.

**Casi limite**, tutti retti senza errori JavaScript: rosa vuota, un solo giocatore, zero
portieri, undici esatti senza panchina, nessun attaccante. Due comportamenti emersi da soli dalla
simulazione: senza panchina l'app avvisa che il modificatore "salta il 25% delle volte", e senza
attaccanti l'ottimizzatore mette in cima 5-4-1 e 4-5-1, cioè i moduli che sprecano meno caselle.

**Tre varianti grafiche** sul branch `grafica-varianti` (mai fuso in `main`), con
`confronto-grafica.html` che le mostra affiancate a 375px come app vere e interattive: A "Campo
vero", B "Chiara", C "Densa". I colori di ruolo non cambiano in nessuna. Da decidere.

## La revisione indipendente, e gli undici bug che ha trovato

Nella notte del 03→04/09 due revisori indipendenti hanno riletto il motore e gli scraper. È
stato il giro più redditizio del progetto: **tutti i test scritti fino a quel momento passavano**,
e i bug c'erano lo stesso.

### Il peggiore: l'app preferiva chi non gioca

`contributoAtteso()` sottraeva 6.0 come voto di riferimento — `certezza × (fantamedia − 6)`.
Per chi ha fantamedia **sotto** 6 quel fattore è negativo, quindi moltiplicarlo per una certezza
più alta lo rende *più* negativo. Colpiva **tutti** i portieri (nessuno arriva a 6, perché la
loro fantamedia include i gol subiti) e più di metà dei difensori.

Riprodotto: con Svilar dato al 90% e due riserve al 5%, l'app mandava in porta una riserva.

Il criterio giusto discende da come funziona `simula()`: chi resta senza voto e senza sostituto
vale **zero**, non 6. Quindi il valore atteso è `certezza × fantamedia`.

**Perché i test non l'avevano visto:** la rosa di prova aveva i tre portieri tutti al 90%. A
certezza costante l'ordinamento tornava giusto per caso. *Le prove vanno fatte su dati che
variano, non su dati comodi* — è la lezione più importante della notte.

### Gli altri, nel motore

- **Il subentro annullava i tetti.** La coda del subentro si sommava *dopo* i tetti su
  infortunati e non convocati: un infortunato risaliva da 0.12 a 0.196, e tutti e 42 gli
  infortunati della giornata uscivano identici al 19,6%.
- **I cambi si scorrevano dai titolari mancanti** invece che dalla panchina. Il regolamento fa
  il contrario, e l'ordine di panchina è proprio quello che l'app fa ricopiare sul sito.
- **La panchina non pesava se un cambio serve** in quel ruolo: un riserva entra solo se manca
  qualcuno del suo reparto.
- **I fissati eccedenti** venivano troncati in ordine di inserimento in rosa, quindi la stessa
  rosa dava formazioni diverse a seconda di come era stata composta.
- **Dati mutilati = pagina bianca.** Un file senza `squadre` o `indisponibili` faceva esplodere
  il primo calcolo, e la copia in cache non era validata affatto — proprio quella usata offline.
- **Squadra fuori dal turno** → certezza fino al 100% e nessun avviso.

### Negli scraper

- **Le ammonizioni venivano buttate.** Non sono un bonus: sono una classe sul voto
  (`player-grade yellow-card`). Senza, i bonus non potevano spiegare il fantavoto — 31 scarti
  su 293, tutti di esattamente −0.5.
- **Mancava la riconciliazione**, che è il controllo più potente disponibile: ricostruire
  `fantavoto = voto + bonus + ammonizione` e verificare che torni. I pesi non sono dati per
  scontati ma **ricavati dai dati**: su G1, 262 giocatori quadrano coi pesi base e i restanti 31
  aggiungendo il malus da ammonizione. Zero casi non spiegati su 293.
- **L'ordine delle tre colonne di voto** era verificato solo sulla prima tabella su venti.
- Più: unicità delle squadre, soglie su indisponibili/ballottaggi/percentuali/panchine,
  `matchweek` concordi, timeout sulle fetch, HTML troncato, ancoraggio del nome squadra,
  marcatori senza `>` finale, `numeroVoto()` separato da `numero()`.

**Il metodo che ha funzionato:** non fidarsi che una validazione sia buona perché passa sui dati
veri, ma **sabotare l'HTML** e guardare cosa intercetta. Cinque sabotaggi su cinque ora bloccati
in `fetch-probabili`, tre su tre in `fetch-voti`.

**Limite accettato e dichiarato:** se il sito riordinasse le celle dei voti lasciando ferme le
intestazioni, nessun controllo sul contenuto potrebbe accorgersene, perché ogni colonna è
internamente coerente. È il prezzo della lettura per posizione.

## Il rendimento reale (primo pezzo della Fase 3)

L'app carica i voti delle giornate già giocate e nella scheda giocatore mostra quanto ha reso
**davvero**, accanto a quanto il modello prevede. Non c'è un indice dei file: si scende dalla
giornata corrente e ci si ferma al primo che manca.

Lo scarto fra reale e stimato si mostra **solo da quattro giornate in su**. Su due partite un
attaccante che ha segnato una doppietta esce con +8 di scarto — Malen oggi fa 15.50 di media
contro una stima di 7.57 — e sembrerebbe che il modello sia rotto quando invece è varianza.
Meglio mostrare i numeri e dire che non bastano, che far dedurre una conclusione falsa.

## Esplorazione grafica in Figma (04/09)

Su richiesta esplicita dell'utente ho ricostruito in Figma campo, testata, tab, KPI e righe della
rosa — fedeli ai valori CSS veri (colori, radii, spaziature copiati 1:1), poi ci ho lavorato con
gli strumenti di precisione di Figma invece che a tentativi con screenshot.

**Esito onesto, non ottimistico:** su tutta la superficie esplorata è emerso **un solo
miglioramento reale**, l'ombra più marcata sulle tessere del campo (già in `main`: il campo ha
uno sfondo verde a righe, molto più vivo del resto dell'app, e il filo di luce sottile di
`--lift` non bastava a staccarcene la tessera). Testata, tab, KPI e righe della rosa sono uscite
**visivamente identiche** all'app già esistente — confronto diretto fatto, non per assunzione.

**Lezione per la prossima volta che si chiede una passata Figma:** il sistema di token di questa
app è già disciplinato. Senza un brief di redesign vero (nuova palette, riferimenti, un cambio di
direzione deciso a monte), un altro giro di "prova a migliorare quello che c'è" molto
probabilmente non troverà granché — l'ha già dimostrato una volta. Non è un motivo per rifiutare
la richiesta se arriva, ma va detto in anticipo per calibrare le aspettative.

**File Figma temporaneo, da cancellare a mano**: `fwGN5XlGMed48p5I0znDU6`
(figma.com/design/fwGN5XlGMed48p5I0znDU6). Non ho un tool di cancellazione file Figma in questo
ambiente; l'utente doveva farlo lui (tasto destro sul file → Move to trash). **Stato non
confermato** — se una sessione futura trova questo file ancora lì, o è stato dimenticato o la
cancellazione non è mai avvenuta.

## Da fare

**Decise e chiuse dal 04/09:**
- Grafica del campo: scelta la variante "campo vero" (erba a righe alternate, tessere scure,
  spaziatura normale). Già in `main`.
- Riga squadra/avversario sul campo: scelto il badge CASA/TRASFERTA + nome avversario per esteso,
  squadra propria tolta. È su `dev`, non ancora pubblicato (vedi regola in testa al file).
- Cadenza degli aggiornamenti: spostato il peso sul venerdì (4 giri invece di 1), tolto il giro
  del giovedì. Dati letti prima da GitHub direttamente, non solo dalla copia Netlify — vedi
  *Aggiornamenti e crediti Netlify*. Repository reso pubblico dall'utente il 04/09: verificato che
  `fetchDati()` legge davvero da GitHub ora (200, non più 404).
- API di Claude a pagamento al posto dello scraper: valutato e scartato per questo compito (vedi
  sopra) — resta un'idea buona per compiti di giudizio/sintesi, non di lettura dati.
- Promemoria per schierare: scelta la notifica push vera (non il calendario), implementata per
  intero — vedi *Notifiche push* sopra.

**Da fare:**
1. **Impostare due secret su GitHub** (repository → Settings → Secrets and variables → Actions)
   perché le notifiche comincino davvero a funzionare — tocca all'utente, non lo faccio io:
   - `VAPID_PRIVATE_KEY`: generata il 04/09, sta nel diario di quella sessione (non in nessun
     file del repo).
   - `PUSH_SUBSCRIPTION`: si ottiene aprendo l'app → Impostazioni → Notifiche → "Attiva
     promemoria", poi copiando il testo che appare.
2. **Provare le notifiche sul telefono vero**: attivarle dall'app, aspettare il prossimo giro
   della Action (o forzarlo da Actions → Run workflow) e controllare che arrivi davvero. Non
   verificabile da qui — vedi *Notifiche push*, il permesso è bloccato in questo ambiente.
3. **Verificare che la Action giri davvero** con la nuova cadenza (primo giro utile: venerdì
   11/09, dato che il round in corso il 04/09 è già partito con la cadenza vecchia). Si può
   forzare da Actions → Run workflow — non tocca `main` né consuma build Netlify, permesso anche
   sotto la regola dev-only.
4. Fase 3 — usare i voti scaricati dentro l'app: storico delle giornate, punteggio calcolato,
   e medie voto misurate che sostituiscono progressivamente quelle stimate.
5. Fase 4 — mercato di riparazione e svincoli.
6. Provare installazione e offline **sul telefono vero** — richiede di pubblicare `dev` su
   `main` almeno una volta, quindi va coordinato con l'utente.
7. **Quando l'utente dice di essere pronto**: merge `dev` → `main`, poi decidere insieme se
   riattivare i build automatici Netlify o fare un deploy manuale singolo (vedi regola in testa
   al file — non decidere in autonomia).

**Aperto, non bloccante:** il regolamento della lega (moduli ammessi, numero di cambi, soglie del
modificatore, e **se il cambio del portiere consuma uno dei tre cambi di movimento** — in molte
leghe no, e questo cambia dove va messo il secondo portiere in panchina: non l'ho indovinato). Si
è partiti con i default: sono costanti in testa al file, sotto *COSTANTI DI LEGA*, e cambiarle non
tocca altro.
