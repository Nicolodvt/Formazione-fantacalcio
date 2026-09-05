# App Formazione — Diario di bordo

**Stato: v0.3 (04/09/2026).** Fasi 0, 1, 2 e 3 chiuse, notifiche push implementate. L'app schiera,
sceglie il modulo, funziona offline, e la stima si mescola da sola con i voti veri man mano che
arrivano — a livello di singolo giocatore (Fase 3), di ruolo (`RETTIFICA_RUOLO`) e di squadra
intera (`MV_SQUADRA`/`ATT_SQUADRA`, per la prossima partita: avversario, casa/trasferta) — più
la condizione fisica recente. La GitHub Action scarica probabili e voti da sola. **Non è ancora
online
su Netlify** — una nota precedente lo dava per fatto, era sbagliata: l'utente non se lo ricordava e
non c'è nessuna traccia di un deploy reale. Resta da fare, apposta, a lavoro finito (vedi
*Aggiornamenti e crediti Netlify* sotto). **Attenzione:** per lo stesso motivo, tutto ciò che è
descritto qui come "automatico" (cadenza rinforzata del venerdì, promemoria push, ricalibrazione)
gira davvero solo su `dev` — GitHub esegue lo `schedule` di una Action solo dalla copia sul branch
di default (`main`), quindi finché non c'è il merge l'automazione reale in produzione è ancora
quella vecchia (vedi *Da fare*, punto 3). Traguardo: **4ª giornata**.

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
- `tools/estrai-motore.mjs` — ricostruisce il motore PURO (`fantamediaStimata`, `mvPura`,
  `MV_SQUADRA`) fuori dal browser, estraendolo da `index.html`. Condiviso da `taratura.mjs` e
  `ricalibra.mjs`, così le due estrazioni non possono divergere fra loro.
- `tools/taratura.mjs` — confronta le stime pure del modello con i fantavoti reali (diagnostica,
  non scrive nulla).
- `tools/ricalibra.mjs` — la parte che **corregge**: stessa diagnostica di `taratura.mjs`, ma
  scrive `dati/costanti.json` con una correzione di ruolo smorzata e limitata. Gira in CI dopo
  lo scraper dei voti. Vedi *L'app impara dalla stagione*.
- `dati/costanti.json` — output di `ricalibra.mjs`, letto dall'app allo stesso modo dei dati di
  giornata (`fetchDati()`). Assente o irraggiungibile ⇒ correzione zero, comportamento di sempre.
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

**Questa è la parte dell'app che conta di più — è il motivo per cui esiste.** L'utente l'ha
chiesto esplicitamente il 04/09: "la cosa che deve essere più curata in assoluto è proprio il
modello di scelta della formazione consigliata". Ogni scelta di questa sezione va soppesata con
questo in mente, non come una feature fra le altre.

Tre grandezze **tenute separate**, mai fuse in un numero solo prima della fine: un fuoriclasse al
20% non è un fuoriclasse quella domenica, e un punteggio unico lo nasconderebbe. Il numero finale
che decide la formazione (`contributoAtteso`) è `certezza × (resa + prossima_partita)`:

- **certezza** (`certezza()`) — probabilità di prendere voto. Dalla percentuale delle probabili,
  corretta da squalifiche, infortuni, dubbi dichiarati dalla fonte — e dal 04/09 anche da quanto
  spesso il giocatore è entrato dalla panchina di recente nonostante fosse "titolare" sulla
  carta (vedi *condizione*, sotto).
- **resa** (`fantamediaAttesa()`) — quanto vale IN MEDIA quando gioca. Stima da quotazioni
  all'inizio, mescolata dal 04/09 con l'andamento reale della stagione (Fase 3, sotto) — le
  giornate più recenti pesano di più di quelle vecchie, non tutte uguali.
- **prossima partita** (`rettificaPartita()`, dal 04/09) — quanto la partita SPECIFICA di questa
  settimana sposta la resa media: fattore campo, e forza dell'avversario nel reparto che conta
  per il ruolo del giocatore. Sommata, non moltiplicata: un forte contro un forte resta forte,
  l'avversario sposta l'ago, non ribalta il giudizio. Vedi *Modello 4* più sotto per i dettagli.

Due cose imparate facendolo all'inizio, che non erano ovvie:

- **Il subentro va sommato solo a chi non parte titolare.** Sommandolo a tutti, i titolari
  diventavano tutti 91% e la lista perdeva ogni informazione. Le riserve, invece, hanno una coda
  vera: entrare a mezz'ora dalla fine e prendere voto capita spesso, e 0.08 era troppo poco.
- **`data-status="warn"` ce l'hanno TUTTE le riserve** (260 su 260): è un dubbio dichiarato solo
  quando sta su un titolare (43 casi). Applicarlo a tutti significava penalizzare due volte.

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

## Fase 3 — i voti veri prendono il sopravvento (chiusa il 04/09)

L'app carica i voti delle giornate già giocate (`caricaStorico()`, che dal 04/09 riscarica solo
le giornate ancora assenti dallo storico invece di rifare tutto da capo a ogni apertura — vedi
sotto) e li usa in **due modi distinti**.

**1. Mostrati accanto alla stima**, nella scheda giocatore: quanto ha reso *davvero* rispetto a
quanto il modello prevedeva all'inizio. Lo scarto si mostra **solo da quattro giornate in su**:
su due partite un attaccante che segna una doppietta esce con +8 di scarto e sembrerebbe che il
modello sia rotto, quando è solo varianza. Meglio mostrare i numeri e dire che non bastano, che
far dedurre una conclusione falsa.

**2. Mescolati dentro la stima stessa**, per pilotare davvero le scelte dell'app (l'undici
proposto, il modificatore proiettato). Stesso schema prior→dati dell'app asta
(`B_PESO_PRIOR=15` per i prezzi): qui la costante è `PESO_PRIOR_STAGIONE=10`, più alta perché il
fantavoto di una singola giornata oscilla molto di più del prezzo pagato da un mercato intero —
serve più tempo prima di fidarsi dei dati più della stima.

- `mvPura()`/`fantamediaStimata()` — le stime pure da quotazioni, **invariate** nella logica
  (solo rinominate: erano `mvStimata()`/`fantamediaAttesa()`). Servono da *prior* e da termine
  di paragone onesto per lo scarto sopra — confrontare il reale con un numero che lo contiene
  già si azzererebbe da solo per costruzione, senza dire nulla.
- `mvStimata()`/`fantamediaAttesa()` — ora sono le versioni **mescolate**: la stima pura più
  quanto misurato finora (`votoMisurato()` per il voto puro/modificatore, `rendimento()` per la
  fantamedia coi bonus). Con zero giornate reali coincidono esattamente con le versioni pure —
  nessuna differenza di comportamento a inizio stagione. Sono queste due, non le pure, che il
  resto dell'app continua a chiamare (`contributoAtteso`, `scegliUndici`, `simula`, la scheda):
  **zero modifiche ai punti di chiamata**, il miglioramento arriva da sé.
- Esempio vero, verificato in questa sessione: Malen dopo G1+G2 (17.5 e 13.5 di fantavoto, media
  reale 15.50) passa da una fantamedia attesa di 7.57 (pura) a **8.89** (mescolata,
  `(10×7.57 + 2×15.50)/12`) — spostata verso il dato vero ma non catapultata lì, perché due
  giornate non bastano ancora a fidarsene del tutto.
- `tools/taratura.mjs` **non** deve testare le versioni mescolate: confrontarle con gli stessi
  voti reali che contengono già sarebbe circolare. Aggiornato per estrarre ed eseguire
  `fantamediaStimata()` (pura) — stesso numero di prima (6.13 di media stimata), invariato.
- `tools/prova-motore.mjs` esegue con `STORICO = {}` (zero giornate reali, come l'app
  all'avvio): le sei invarianti restano tutte valide con le versioni mescolate che ricadono
  sulle pure — verificato dopo la modifica, nessuna regressione.

**Trovato dalla scansione di audit del 04/09** (indipendente da questo lavoro, girata in
parallelo): `caricaStorico()` riscaricava *ogni* giornata passata a ogni apertura dell'app —
fino a 37 richieste sequenziali avvicinandosi a fine stagione — e il risultato **sostituiva**
integralmente lo storico salvato, così un singolo errore di rete cancellava in silenzio dati già
buoni. Corretto: ora si scarica solo ciò che manca e si somma, mai si riparte da zero.

## Modello 4 — la prossima partita, l'andamento, la condizione (04/09)

Richiesta esplicita dell'utente, con priorità dichiarata sopra ogni altra cosa in corso:
"deve essere un bilanciamento tra l'andamento del giocatore nella stagione, [...] la prossima
partita (se casa/trasferta, contro che avversario, condizione fisica del giocatore)". I tre
pezzi, e come sono stati costruiti:

### 1. La prossima partita — `rettificaPartita()`

Prima non contava *nulla* per la scelta: solo mostrata (avversario, casa/trasferta) nel badge sul
campo, mai usata per decidere. Ora sposta la resa attesa, sommando due termini:

- **Fattore campo**: `CASA_BONUS = 0.08`, in casa aggiunge, in trasferta toglie. Piccolo e
  dichiaratamente stimato, non misurato — vedi *limite* sotto.
- **Forza dell'avversario nel reparto che conta**: per P/D conta la forza OFFENSIVA
  dell'avversario (`ATT_SQUADRA`, nuovo indice, costruito come `MV_SQUADRA` ma dai migliori
  centrocampisti/attaccanti invece che da difensori — stessa normalizzazione, `normalizzaSquadre()`
  estratta come funzione condivisa); per C/A conta la forza DIFENSIVA dell'avversario
  (`MV_SQUADRA`, già esistente per il modificatore). Scalato da `PESO_AVVERSARIO = 1.4`.

Sommato, non moltiplicato: un forte contro un forte resta forte, l'avversario sposta l'ago di
qualche decimo, non ribalta il giudizio. Si applica in **tre punti**, non uno solo, perché la
partita specifica conta ovunque un voto viene proiettato: `contributoAtteso()` (decide chi
schierare), `simula()` sia sul totale punti sia sul voto che alimenta il modificatore proiettato
(prima usava solo la media stagionale, ignorando l'avversario di questa settimana), e la scheda
giocatore (mostrata separata, mai un numero che nasconde da dove viene: "media X → +Y, in casa
contro Z (difesa debole)").

**Limite dichiarato, uguale a `BONUS_MAX`/`PESO_PRIOR_STAGIONE`**: `CASA_BONUS` e
`PESO_AVVERSARIO` sono stimati a intuito, non tarati su risultati veri — con 2-3 giornate di
campionato non c'è ancora campo a sufficienza. Tenuti piccoli apposta per questo. Da ritarare con
`taratura.mjs` quando ci saranno più giornate (vedi *Da fare*).

**Test di dominanza aggiornato di conseguenza** (`tools/prova-motore.mjs`): la prova 1 già
verificava che un giocatore migliore su certezza e resa non potesse mai finire sotto uno peggiore
su entrambe. Con `rettificaPartita()` due giocatori identici su certezza e resa possono ora finire
ordinati diversamente perché le loro squadre affrontano avversari diversi — è il comportamento
VOLUTO, non un bug. La prova ora controlla la dominanza su tutte e tre le dimensioni insieme
(certezza, resa, aggiustamento partita), non più solo sulle prime due: **più stretta di prima**,
non allentata — verificato che passa comunque su tutti i ruoli.

### 2. L'andamento in stagione — pesatura per la forma recente

`rendimento()` e `votoMisurato()` (l'ingrediente "misurato" che si mescola con la stima, Fase 3)
usavano una media PIATTA su tutte le giornate giocate: un giocatore in un vero momento di forma
nelle ultime 3 partite pesava uguale a uno stesso giocatore di inizio stagione. Ora
`mediaPesataForma()` pesa ogni giornata con `DECADIMENTO_FORMA = 0.85` elevato a quante giornate
fa è stata giocata: la più recente pesa 1, quella precedente 0.85, e così via — dimezza il peso
ogni 4-5 giornate. Condivisa fra voto puro e fantavoto coi bonus, così invecchiano allo stesso
modo. Con 2 giornate come oggi la differenza è minima (Malen passa da 15.50 piatto a 15.34
pesato); è con la stagione avviata che comincia a contare davvero.

### 3. La condizione fisica — `tassoSubentro()`

Il segnale più difficile da ottenere bene, e il più limitato dai pochi dati di oggi. Non esiste
un "indice di condizione fisica" nella fonte: quello che c'è, e prima veniva scartato, è il campo
`subentrato` di ogni voto (entrato dalla panchina invece di partire titolare) —
`caricaStorico()` ora lo salva in `STORICO` insieme a voto e fantavoto.

**Migrazione necessaria**: chi aveva già uno storico salvato prima di questa modifica ce l'ha
senza quel campo, e il controllo "giornata già presente, non riscaricare" lo terrebbe così per
sempre. Aggiunto un controllo una tantum in `caricaStorico()`: se una voce manca di
`subentrato`, tutto lo storico si azzera e si riscarica da capo (economico, sono file JSON
piccoli).

**Uso, deliberatamente conservativo**: non un segnale nuovo indipendente (con 2 giornate sarebbe
solo rumore), ma un affinamento di uno sconto che esisteva già. `certezza()` scontava già dello
0.85 fisso un titolare "in dubbio" secondo la fonte; ora lo sconto scala fra 0.85 (mai subentrato
di recente) e 0.70 (sempre subentrato nelle ultime presenze), solo quando la fonte segnala già
un dubbio — mai in contraddizione con il segnale principale della settimana, solo un modo più
preciso di quantificare un dubbio che c'era comunque. Mostrato anche nella scheda giocatore,
accanto a ogni fantavoto storico, con l'etichetta "(sub)" — così l'utente vede il segnale grezzo
e può giudicare da solo, non solo il numero che ne esce.

**Verificato dal vivo nel browser**, non solo con gli strumenti da terminale: Malen (in casa
contro Atalanta, difesa nella media) passa da 8.86 di resa media a 8.91 finale (+0.05); Svilar
(stesso avversario, portiere) da 5.46 a 5.49; Bernardeschi (in casa contro Sassuolo, difesa
debole) da 6.46 a 6.73 (+0.27, il caso con lo sbalzo più marcato fra quelli provati) — e la sua
riga G1 mostra correttamente "(sub)", confermando che il campo nuovo arriva fino all'interfaccia.
Tutti i conti tornano a mano. `node --check`, `controlla.mjs`, `prova-motore.mjs` e
`taratura.mjs` puliti prima e dopo ogni pezzo.

## L'app impara dalla stagione — RETTIFICA_RUOLO (04/09)

Chiesto dall'utente: può l'app imparare da quello che ha consigliato in precedenza e
dall'esito, per diventare più precisa durante la stagione? Sì, con un meccanismo scelto per
essere **trasparente e prudente**, non un "impara da sola" opaco — coerente con tutto il resto
del modello (mai un numero che nasconde da dove viene, costanti dichiarate quando sono stime).

**Cosa fa**: `tools/ricalibra.mjs` (nuovo) confronta la stima PURA (`fantamediaStimata`, mai
quella già mescolata con i dati del singolo giocatore — sarebbe circolare, vedi la stessa nota
già fatta per `taratura.mjs`) con **tutti** i fantavoti reali scaricati finora, per ruolo. Se lo
scarto sistematico è abbastanza grande e il campione abbastanza ampio da fidarsene, aggiorna una
correzione — un solo numero per ruolo, `RETTIFICA_RUOLO`, non un riadattamento di ogni costante
del modello (perché no, sotto). Scrive `dati/costanti.json`, letto dall'app con `fetchDati()` —
stesso meccanismo dei dati di giornata: la correzione arriva **senza deploy**, come tutto il
resto in questa architettura.

**Tre reti di sicurezza contro il rumore dei primi turni** (le due giornate di oggi bastano a
spiegare perché servono):
- **Soglia minima di campione**: `MIN_CAMPIONE = 30` osservazioni (giocatore-giornata, non
  giocatori unici) per ruolo. Sotto, non si tocca nulla — si tiene la correzione precedente.
- **Correzione limitata**: mai oltre `LIMITE = 0.4` fantavoto, qualunque cosa dicano i dati.
- **Aggiornamento smorzato**: `TASSO_APPRENDIMENTO = 0.3` — ogni giro si sposta solo il 30%
  della distanza fra la correzione attuale e quella appena misurata, non un salto diretto.
  Provato dal vivo lanciando lo script tre volte di fila sugli stessi dati: il portiere
  converge 0 → 0.071 → 0.120 → 0.155 verso l'obiettivo di 0.235, mai un balzo.

**Dove si applica, e perché lì e non altrove**: dentro `fantamediaAttesa()`, sommata alla stima
pura **prima** della mescola con il rendimento del singolo giocatore (Fase 3), non dopo. È
voluto: un giocatore con pochi dati personali deve sentirla piena, uno con molte presenze reali
proprie deve vederla sfumare da sola — esattamente il comportamento che `mescola()` già dà
gratis in base a `r.presenze`, senza bisogno di scriverlo una seconda volta. Verificato dal vivo:
Malen (correzione ruolo A = +0.025, ma solo 2 presenze proprie) passa da 8.91 a 8.93, non a 8.94
— la mescola smorza anche la correzione di ruolo, coerentemente.

**Cosa NON corregge, deliberatamente**:
- **`CASA_BONUS` e `PESO_AVVERSARIO`** (Modello 4) restano a intuito. Per tararli sui risultati
  veri servirebbe sapere, per ogni giornata passata, chi ha giocato in casa/trasferta contro chi
  — un calendario storico che oggi non esiste (`dati/probabili.json` ha solo il turno
  *corrente*, sovrascritto ogni settimana; `voti-N.json` non porta avversario né casa/trasferta).
  Costruirlo è fattibile (uno scraper del calendario stagionale, o un piccolo passo che archivia
  il turno prima che venga sovrascritto) ma è un pezzo di infrastruttura nuovo, non una riga in
  più a uno script esistente — da valutare con l'utente se vale la pena, non deciso qui.
- **`PESO_PRIOR_STAGIONE` e `DECADIMENTO_FORMA`** (quanto velocemente fidarsi dei dati di un
  singolo giocatore, quanto pesano le giornate recenti) non si auto-tarano: valutare se
  *aiutano* la previsione richiederebbe un vero backtest (stima al tempo T confrontata con
  l'esito al tempo T+1, ripetuto nel tempo), più complesso e più a rischio di rincorrere il
  rumore del semplice confronto scala-contro-scala che regge `RETTIFICA_RUOLO`. Restano
  costanti manuali, ritarabili a mano con `taratura.mjs` quando ci saranno più giornate.
- **Un resoconto "cosa avevo consigliato vs cosa è successo"** (mostrato all'utente, non solo
  usato per correggere il modello) è un'idea buona lasciata per dopo: richiederebbe salvare uno
  snapshot della formazione consigliata prima di ogni giornata e confrontarlo a posteriori con
  l'undici ottimale con i voti veri — una feature di fiducia/trasparenza in più, distinta da
  questa (che corregge il modello, non racconta come è andata). Era già nel piano originale
  ("confronto tra la formazione schierata e quella che a posteriori era ottimale", Fase 3) e non
  ancora costruita — buon prossimo passo se l'utente lo chiede.

**Verificato**: `node --check`, `controlla.mjs`, `prova-motore.mjs` (aggiunto
`RETTIFICA_RUOLO={P:0,D:0,C:0,A:0}` all'ambiente ricostruito, tutte le invarianti passano
invariate), `taratura.mjs` (rifattorizzato insieme a `ricalibra.mjs` su un modulo condiviso,
`tools/estrai-motore.mjs`, così le due estrazioni non possono più divergere fra loro; numeri di
`taratura.mjs` invariati, nessuna circolarità). `ricalibra.mjs` provato più volte per controllare
lo smorzamento, poi ripristinato a un singolo giro pulito prima del commit. Dal vivo nel browser,
Malen verificato a mano come sopra.

## Le squadre imparano anche loro — MV_SQUADRA/ATT_SQUADRA operative (04/09)

Osservazione mia, chiesta esplicitamente dall'utente dopo che gliel'ho segnalata: la forza delle
squadre usata dal *Modello 4* (`MV_SQUADRA`, `ATT_SQUADRA`) veniva calcolata una volta sola dalle
quotazioni di inizio stagione e non si aggiornava mai più — una squadra che si rivela più forte o
più debole del previsto restava giudicata su agosto fino a maggio, mentre singolo giocatore
(Fase 3) e ruolo (`RETTIFICA_RUOLO`) già si correggevano da soli.

**La priorità dell'utente, dichiarata esplicitamente**, e il motivo per cui questo non è stato
rimandato come gli altri due punti lasciati fuori: *"l'obiettivo non è avere un modello perfetto
all'ultima giornata [...] l'obiettivo sarebbe costruirmi un oracolo da consultare prima di
schierare ogni formazione [già dalla prossima giornata]"*. Un miglioramento che si attiva subito
(con 2 giornate già dice qualcosa) vale più di uno che aspetta fine stagione per convergere.

**Come funziona**: stesso schema prior→dati di tutto il resto, applicato ora alla squadra
intera invece che al singolo giocatore.
- `MV_SQUADRA_PURA`/`ATT_SQUADRA_PURA` (rinominate da `MV_SQUADRA`/`ATT_SQUADRA`, calcolo
  invariato) restano il *prior*, calcolate una volta da `calcolaMvSquadre()`.
- `misuraGruppo()` (nuova) applica `mediaPesataForma()` — già esistente per il singolo
  giocatore — a un **gruppo** di giocatori insieme: la media pesata sulla forma recente di
  tutti i difensori/portiere di una squadra (voto puro, per `MV_SQUADRA`) o di tutti i suoi
  centrocampisti/attaccanti (fantavoto coi bonus, per `ATT_SQUADRA`).
- `aggiornaForzaSquadre()` (nuova) mescola pura e misurata con `mescola()`, per ogni squadra, e
  scrive il risultato in `MV_SQUADRA`/`ATT_SQUADRA` — questi restano i nomi che
  `rettificaPartita()` e la scheda giocatore già usavano, **zero modifiche ai punti di
  chiamata**. Va richiamata ogni volta che `STORICO` cambia, non solo all'avvio: aggiunta dopo
  `caricaStorico()` sia nella sequenza di apertura sia nel bottone "Aggiorna".

**Attenzione alla contaminazione, stessa disciplina di sempre**: `mvPura()`, `golSubitiAttesi()`
e il ramo C/A di `fantamediaStimata()` leggono esplicitamente le versioni `_PURA` — dovevano
restare non toccate da dati reali per lo stesso motivo per cui `fantamediaStimata()` stessa
doveva restarlo (altrimenti `taratura.mjs` diventa un confronto circolare). `tools/estrai-motore.mjs`
e `tools/prova-motore.mjs` aggiornati di conseguenza.

**Verificato dal vivo, non solo con gli strumenti**: dopo G1+G2, Atalanta passa da "difesa nella
media" e "attacco nella media" a **"difesa forte"** e **"attacco forte"** — una squadra che si
sta rivelando più forte del previsto su entrambe le fasi, esattamente il caso che questo pezzo
doveva coprire. Malen (Roma, in casa contro Atalanta) passa da +0.05 a **-0.01**: il fattore
campo non basta più a compensare un avversario che i dati dicono più forte della quotazione.
Svilar, stesso avversario, da un aggiustamento quasi nullo a **-0.37**. `node --check`,
`controlla.mjs`, `prova-motore.mjs`, `taratura.mjs` puliti prima e dopo.

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

## Cadenza degli aggiornamenti, seconda revisione (05/09)

**Confermato che leggere piu' spesso non costa niente**, prima di farlo: repository pubblico →
GitHub Actions gratis e senza limite di minuti; i dati arrivano al telefono leggendo direttamente
da GitHub (`fetchDati()`), non attraverso una pubblicazione Netlify — quindi nessuna delle due
quote di cui parla *Aggiornamenti e crediti Netlify* sopra viene toccata da quante volte lo
scraper gira. L'unico limite reale resta la cortesia verso fantacalcio.it (User-Agent dichiarato,
niente raffiche), non un costo.

Su questa base, richiesta dell'utente il 05/09: **lunedi e martedi** ora scaricano i voti del
turno appena concluso (mattina e sera, prima solo martedi sera); **mercoledi** 2 giri, **giovedi**
5, **venerdi** un giro all'ora dalle 08:00 alle 20:00 (prima erano 4 letture fisse). Dettagli e
orari esatti in `.github/workflows/dati.yml`.

**Turno infrasettimanale.** Se la prossima giornata comincia lunedi-giovedi invece che nel
weekend, la preparazione che normalmente sta fra mercoledi e venerdi arriverebbe dopo il fischio
d'inizio. Non si può far scattare una lettura extra "al bisogno" (i cron di GitHub sono fissi),
quindi la soluzione è che lunedi e martedi restano già abbastanza fitti da coprire anche questo
caso, in aggiunta al loro scopo normale di raccogliere i voti. `tools/invia-promemoria.mjs`
riconosce da solo il caso e manda un promemoria diverso e più esplicito invece del solito
"Giornata N: schiera la formazione". **Limite dichiarato:** se un turno infrasettimanale
cominciasse lunedì mattina prestissimo, la prima occasione di avviso (lunedì 09:00 CEST)
potrebbe arrivare a ridosso della partita — caso limite non risolvibile con cron fissi, mai
verificato perché non ancora capitato.

**Aggiornamento 05/09, richiesto dall'utente**: il martedì ora diventa da solo orario (come il
venerdì di un turno normale) quando serve davvero. `tools/turno-infrasettimanale.mjs` legge
l'ultimo `dati/probabili.json` già sul disco e risponde vero/falso; il workflow lo consulta prima
di ogni giro extra del martedì (`0 6,8-18 * * 2`, in aggiunta al giro base delle 09/21) e salta
senza toccare fantacalcio.it se la risposta è falsa. Stessa domanda ("che giorno cade la prima
partita, fuso di Roma") ora vive in un solo posto, `tools/calendario.mjs`, condiviso fra questo
script e `invia-promemoria.mjs` — prima la stessa logica era duplicata lì dentro. Il lunedì
resta senza giro extra apposta: renderlo orario non anticiperebbe comunque il primo avviso utile
delle 09:00 (vedi il limite qui sopra). Il testo del promemoria ora contiene la frase esatta
"turno infrasettimanale" sia nel titolo sia nel corpo, non solo nel titolo: chiesto esplicitamente,
per restare leggibile anche se il telefono mostra solo una riga della notifica.

**Audit richiesto dall'utente lo stesso giorno** ("abbiamo coperto tutte le casistiche?"), due
correzioni reali trovate e sistemate subito, non solo segnalate:

1. **La classificazione "infrasettimanale" era sbagliata su un caso reale**, non ipotetico. La
   prima versione guardava solo la PRIMA partita del turno: un turno di weekend normale che
   comincia con un anticipo di giovedì risulterebbe "infrasettimanale" anche se il resto sta nel
   weekend come sempre. Il tentativo di correzione — guardare l'ULTIMA partita invece della prima
   — si è rivelato **peggiore**, verificato sui dati veri: la giornata 3 (weekend normalissimo)
   chiude con Udinese-Lazio di lunedì sera, quindi sarebbe stata segnalata come infrasettimanale
   per errore. La regola giusta, quella ora in `tools/calendario.mjs`, guarda **tutte** le
   partite: è infrasettimanale solo se **nessuna** cade di venerdì, sabato o domenica — cioè se
   il turno non tocca il weekend per niente, non se comincia o finisce vicino a un giorno feriale.
   Verificato con tre casi (un vero turno infrasettimanale, un weekend con un anticipo di
   giovedì, e la giornata 3 vera) prima di fidarsene.
2. **Un turno infrasettimanale infilato in mezzo poteva far perdere per sempre i voti di
   un'altra giornata.** Lo scraper dei voti calcolava quale giornata scaricare come "quella nelle
   probabili meno uno": funziona quando si conclude esattamente una giornata a settimana, ma se
   un turno infrasettimanale ne fa concludere due nella stessa settimana, la settimana dopo il
   conto è già avanzato oltre la prima delle due — che non viene mai più ritentata da nessuna
   parte. Non è un errore che si vede: nessun avviso, nessun rosso nella Action, solo uno
   `voti-N.json` che manca in silenzio e uno storico con un buco. **Sistemato**: ora lo script
   scorre tutte le giornate da 1 fino all'ultima conclusa e riprova solo quelle il cui file manca
   ancora — economico per le giornate già a posto (un controllo su disco, zero richieste), e in
   più recupera da solo anche un giro perso per un guasto della Action, non solo questo caso.
3. **Limite non risolto, giudicato a rischio troppo basso per meritare una soluzione oggi**: se
   un turno infrasettimanale iniziasse lunedì mattina prestissimo (mai capitato, e strutturalmente
   raro: la Serie A lascia sempre almeno un giorno di riposo dopo il weekend prima di un turno
   compresso), l'unico avviso arriverebbe alle 09:00, a ridosso della partita. Già dichiarato
   sopra, confermato qui dopo l'audit.
4. **Limite non affrontato, fuori scope per ora**: il cambio dall'ora legale a quella solare
   (ultima domenica di ottobre) sposta di un'ora tutti gli orari "CEST" scritti nei cron e nei
   commenti — la stagione arriva fino a maggio, quindi li attraversa. Da rivedere quando ci si
   arriva, non prima: sistemarlo ora per un evento di fine ottobre sarebbe ottimizzare su una
   scadenza lontana invece che su quelle vere di settembre.

## Dettaglio grezzo in STORICO (05/09)

`caricaStorico()` salvava solo voto/fantavoto/senzaVoto/subentrato da ogni `dati/voti-N.json`,
scartando il resto — che però lo scraper scarica già per ogni giocatore: gol, assist, rigori
(segnati/sbagliati/parati), autogol, gol subiti (per i portieri), ammonizione. Ora finisce anche
questo in `STORICO`, con la stessa migrazione una tantum già usata per `subentrato` (si controlla
un campo nuovo, se manca si azzera la cache e si riscarica — righe piccole, costo nullo).

**Deliberatamente non usato ancora da nessun calcolo.** Oggi il modello continua a leggere solo
`voto`/`fantavoto` da `STORICO`; gol/assist/rigori restano lì fermi, in attesa che ci siano
abbastanza giornate vere per tarare `BONUS_PIAZZATI`/`BONUS_MAX` sull'osservato invece che
sull'intuito (oggi 2 giornate, troppo poche per distinguere un segnale da rumore — stessa soglia
di prudenza di `RETTIFICA_RUOLO`, `MIN_CAMPIONE`). È il primo dei due passi verso l'"oracolo"
concordati il 04/09 (vedi *Da fare*, punto 7): a rischio pressoché nullo perché è solo memoria in
più, nessun nuovo meccanismo che possa sbagliare qualcosa oggi.

Non tocca `tools/estrai-motore.mjs`: il motore "puro" condiviso da `taratura.mjs`/`ricalibra.mjs`
non ha mai letto `STORICO`, quindi non c'era nulla da disallineare. Verificato con tutti e
quattro gli strumenti (`controlla.mjs`, `prova-motore.mjs`, `taratura.mjs`): numeri identici a
prima, nessuna perdita di funzioni/listener/selettori.

## Manovrabilità da smartphone (05/09)

Richiesta esplicita dell'utente: gesti, tasto indietro, attenzione alla batteria, "tutto quello
che viene in mente" per un'app pensata per essere usata dal telefono. Tutto verificato dal vivo
in emulazione mobile (375×812, touch) prima di considerarlo fatto — non solo per sintassi.

**Tasto/gesto "indietro" chiude la sheet aperta, non esce dall'app.** Prima non c'era nessun
collegamento con la cronologia del browser: su un'app installata, "indietro" senza una pagina
precedente vera esce semplicemente dall'app. Ora aprire una sheet (`apriSheet()`, `apriSettings()`)
spinge una voce finta nella cronologia (`history.pushState`); un "indietro" la trova e la consuma
(`popstate` → `chiudiSheet(true)`) invece di uscire. **Bug preso prima di spedirlo**: quattro punti
del codice passano `chiudiSheet` direttamente come callback di un click
(`addEventListener('click', chiudiSheet)`), quindi ricevono l'oggetto `Event` del click come primo
argomento — sempre "vero". Un controllo tipo `if(!daIndietro)` li avrebbe scambiati tutti per
chiusure "da indietro", saltando `history.back()` e lasciando in giro voci di cronologia mai
consumate (un "indietro" vero, dopo, sarebbe sembrato non fare nulla la prima volta). Il controllo
è `daIndietro !== true`: solo il gestore di popstate passa il booleano letterale `true`.
Verificato aprendo/chiudendo la sheet più volte di fila: la lunghezza della cronologia resta
piatta, non cresce mai.

**Swipe in basso sulla maniglia per chiudere** (`attivaTrascinamentoSheet()`), come i fogli
nativi. Parte solo dalla maniglia — il resto della sheet (liste, testo, textarea) deve restare
scorribile/selezionabile senza rischiare una chiusura per un tocco un po' verticale. Sotto il 28%
dell'altezza della sheet scatta indietro, sopra scivola via e chiude.

**Swipe orizzontale fra Campo/Rosa/Moduli** (sul contenuto principale, non serve toccare la
testata). Il blocco di direzione è la parte che conta: nei primi 10px di movimento si decide UNA
volta se il gesto è più orizzontale o più verticale, e da lì non si cambia idea — deciso
verticale, lo scroll delle liste funziona esattamente come se lo swipe non esistesse. Ignorato
per `pointerType==='mouse'`: è un gesto touch, un trascinamento col mouse non deve spostare tab
per sbaglio mentre si seleziona del testo.

**Pull-to-refresh** in cima al contenuto, oltre al tasto "Aggiorna" in testata che resta il modo
principale. Parte solo se il contenuto è già scrollato in cima — altrimenti è scroll normale.
L'indicatore (`#pullTira`) è un fratello di `<main>`, non un figlio: `render()` riscrive
`main.innerHTML` di continuo, un indicatore messo lì dentro sparirebbe ad ogni ridisegno.

**Aggiornamento quando l'app torna in primo piano, non un timer.** `visibilitychange` controlla
se i dati sono passati di moda (`oreDati()>0.75`, cioè 45 minuti) solo nel momento in cui l'utente
riapre l'app, invece di un controllo periodico che girerebbe (e consumerebbe batteria) anche a
schermo spento in tasca. Per un'app che si apre una volta a settimana, un timer in sottofondo
costerebbe sempre per un guadagno quasi sempre nullo.

**Deliberatamente NON aggiunto: nessun Wake Lock.** Non è un'app da tenere aperta a schermo acceso
per minuti (a differenza, potenzialmente, dell'app asta durante un'asta dal vivo): si apre, si
schiera, si chiude. Un Wake Lock qui consumerebbe batteria per un beneficio che non esiste.

**Altri dettagli, minori ma verificati:** `touch-action:manipulation` su bottoni e tab toglie il
ritardo di ~300ms prima di ogni tap e il doppio-tap-zoom accidentale; `overscroll-behavior-y:
contain` su `<main>` evita che scorrere fino in fondo a una lista faccia "rimbalzare" anche la
pagina intorno; meta tag `apple-mobile-web-app-*` e `apple-touch-icon` per quando l'app viene
aperta da schermata Home su iPhone (**non verificato su un iPhone vero**: alcune versioni di iOS
ignorano le icone in data URI per questo tag specifico — stesso tipo di limite già dichiarato per
il service worker dell'app asta).

**Costruito e tolto lo stesso giorno: la vibrazione.** Una `vibra()` breve confermava le azioni
che cambiano stato (giocatore fissato, modulo cambiato, reparto pieno). L'utente ha chiesto di
toglierla appena vista la lista — rimossa insieme a tutti i suoi punti di chiamata, non solo
disattivata, per non lasciare codice morto.

**Verificato ma non nel modo consueto.** Il browser di prova in questo ambiente non renderizza
sempre il pannello (i click via coordinate schermo andavano a vuoto silenziosamente): la verifica
vera è stata rifatta creando eventi `PointerEvent` sintetici via `javascript_tool` e leggendo lo
stato del DOM prima/dopo (posizione della sheet, testo dell'indicatore, tab attivo, lunghezza
della cronologia) — non solo un controllo a occhio su uno screenshot. Limite dichiarato: eventi
sintetici provano che la LOGICA reagisce correttamente, non la sensazione al tatto reale (velocità,
inerzia) di un dispositivo vero, mai testata qui.

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
- Fase 3: i voti veri ora si mescolano da soli nella stima (non solo mostrati accanto), con lo
  stesso schema prior→dati dell'app asta. Corretto in parallelo un bug reale trovato dalla
  scansione di audit (`caricaStorico()` riscaricava tutto da zero a ogni apertura, e un errore
  di rete poteva cancellare dati già buoni) — vedi sopra.
- **Modello 4 — la prossima partita, l'andamento pesato, la condizione fisica**: i tre pezzi
  chiesti esplicitamente dall'utente come priorità sopra ogni altra cosa in corso, tutti e tre
  implementati e verificati dal vivo — vedi la sezione dedicata sopra.
- **L'app impara dalla stagione**: `RETTIFICA_RUOLO`, una correzione automatica per ruolo,
  smorzata e limitata, che l'app legge da `dati/costanti.json` senza bisogno di deploy — vedi
  la sezione dedicata sopra. Lasciate fuori deliberatamente: la taratura automatica di
  `CASA_BONUS`/`PESO_AVVERSARIO` (serve un calendario storico che non esiste ancora) e un
  resoconto "cosa avevo consigliato vs cosa è successo" (feature di fiducia separata, non di
  correzione del modello) — entrambe buone idee per dopo, non decise qui.
- **Le squadre imparano anche loro**: `MV_SQUADRA`/`ATT_SQUADRA` (Modello 4) non sono più
  ferme alle quotazioni di agosto, si mescolano con quanto ogni squadra ha reso davvero — vedi
  la sezione dedicata sopra. Deciso subito, non rimandato come gli altri due punti sopra: priorità
  dichiarata dall'utente è un aiuto valido già dalla prossima giornata, non un modello perfetto
  a fine stagione.

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
3. **Verificare che la Action giri davvero** con la nuova cadenza. **Corretto il 05/09: non parte
   da sola venerdì 11/09 come scritto qui prima.** GitHub legge lo schedule (`on: schedule:`) di
   un workflow SOLO dalla versione del file che sta sul branch di default (`main`), mai da `dev`,
   anche se il workflow gira comunque ad ogni push su `dev`. Verificato lo storico Action su
   GitHub: un solo run finora, con la cadenza vecchia (quella ancora presente su `main`, senza il
   giro di venerdì rinforzato, senza promemoria push, senza ricalibrazione). La cadenza nuova
   diventa reale solo al merge `dev` → `main` (vedi punto 11) — fino ad allora **su `main` non
   sta girando niente di quello che sembra deciso qui**, non solo la cadenza: neanche i promemoria
   né la ricalibrazione automatica.
4. **Ritarare le costanti scelte a intuito** dopo qualche giornata in più — tutte segnate come
   tali nel codice, nessuna nascosta: `PESO_PRIOR_STAGIONE` (10), `CASA_BONUS` (0.08),
   `PESO_AVVERSARIO` (1.4), `DECADIMENTO_FORMA` (0.85). Con `taratura.mjs`, quando ci saranno
   abbastanza giornate da distinguere un segnale vero dal rumore — su 2-3 non ancora.
5. **Verificare che `ricalibra.mjs` giri davvero in CI e che `dati/costanti.json` si aggiorni**
   nel tempo con dati sensati (stesso discorso del punto 3, aspetta un martedì vero con voti
   nuovi). Occasione buona anche per guardare come si muove `RETTIFICA_RUOLO` giornata dopo
   giornata: se oscilla parecchio lo smorzamento va indurito, se non si muove mai forse è troppo
   prudente — solo i dati veri lo diranno.
6. **Usare per il modello il dettaglio gol/assist/rigori/cartellini salvato in `STORICO` dal
   05/09** (vedi *Dettaglio grezzo in STORICO* sopra): oggi è solo memoria, non entra in nessun
   calcolo. Quando ci saranno abbastanza giornate vere (stessa soglia di prudenza di
   `RETTIFICA_RUOLO`), usarlo per tarare `BONUS_PIAZZATI`/`BONUS_MAX` sull'osservato — chi segna
   davvero i rigori della propria squadra, quanto valgono in media i suoi bonus — invece che a
   intuito come oggi. Richiesto esplicitamente dall'utente il 05/09.
7. **Decidere se costruire il calendario storico** (chi ha giocato contro chi, dove) per poter
   tarare anche `CASA_BONUS`/`PESO_AVVERSARIO` sui risultati veri — non deciso, vedi *L'app
   impara dalla stagione*. E se vale la pena del resoconto "formazione consigliata vs esito",
   già previsto nel piano originale e non ancora costruito.
8. **Verso l'"oracolo" — dati sottostanti (tiri, xG)**: ricerca fatta il 05/09 (vedi anche la
   memoria di sessione `app-formazione-visione-modello`). La fonte esiste davvero: Understat
   copre la Serie A e ha già la stagione 2026/27 in corso, per giocatore, aggiornata live
   (verificato dal vivo su `understat.com/league/Serie_A`) — con la stessa metrica xG che regge
   l'analisi sportiva professionale. Prova concreta che aiuterebbe: Malen è lo scarto più grande
   di `taratura.mjs` (stima 7.57, reale 15.50) e su Understat ha davvero 5 gol da soli 3.80 xG in
   140 minuti — un sovra-rendimento che un modello guidato dai gol non può distinguere da un vero
   salto di livello, un dato sui tiri sì. **Ma non è un "sì" pulito, per due motivi:**
   - **Nessun id in comune con fantacalcio.it.** L'aggancio dovrebbe essere per nome+squadra
     ("Donyell Malen" vs il "Malen" del listone), non per id come con fantacalcio.it — la stessa
     fragilità ("Martinez L." vs "Lautaro Martinez") che il progetto ha evitato apposta altrove.
   - **Le fonti gratuite più note non vogliono essere scaricate in automatico.** Il
     `robots.txt` di Understat è `Disallow: /` per chiunque, senza eccezioni — un "no" esplicito
     ai bot, diverso da fantacalcio.it che non ne ha uno. FBref (l'alternativa più nota) risponde
     con la sfida anti-bot di Cloudflare ("Just a moment...") a un fetch semplice come quelli già
     scritti in questo progetto (zero dipendenze): non è un limite tecnico superabile con lo
     stesso stile di scraper, servirebbe un browser vero.
   Conclusione: **il salto di qualità sarebbe reale, ma costruirlo oggi vorrebbe dire o ignorare
   il `robots.txt` dichiarato di un sito o inseguire un blocco anti-bot** — un compromesso diverso
   da quello fatto finora con fantacalcio.it (scraper gentile, User-Agent dichiarato, poche
   richieste, nessun blocco da parte loro). Non costruito: da decidere insieme se e come, non una
   cosa da avviare in autonomia. **L'utente ha detto il 05/09 di rimandare questa decisione a
   quando il resto sarà finito** — non ha gli strumenti tecnici per valutarla ora, e da sola non
   è urgente (è un miglioramento, non blocca nulla di ciò che serve per la 4ª giornata).
9. Fase 4 — mercato di riparazione e svincoli.
10. Provare installazione e offline **sul telefono vero** — richiede di pubblicare `dev` su
   `main` almeno una volta, quindi va coordinato con l'utente.
11. **Quando l'utente dice di essere pronto**: merge `dev` → `main`, poi decidere insieme se
   riattivare i build automatici Netlify o fare un deploy manuale singolo (vedi regola in testa
   al file — non decidere in autonomia).
12. **Provare sul telefono vero i gesti aggiunti il 05/09** (vedi *Manovrabilità da smartphone*):
   verificati solo con eventi sintetici in emulazione, mai il tatto reale. In particolare lo
   swipe fra tab e il pull-to-refresh, che dipendono di più dalla sensazione (velocità, inerzia)
   di quanto la logica da sola possa garantire.

**Aperto, non bloccante:** il regolamento della lega (moduli ammessi, numero di cambi, soglie del
modificatore, e **se il cambio del portiere consuma uno dei tre cambi di movimento** — in molte
leghe no, e questo cambia dove va messo il secondo portiere in panchina: non l'ho indovinato). Si
è partiti con i default: sono costanti in testa al file, sotto *COSTANTI DI LEGA*, e cambiarle non
tocca altro.
