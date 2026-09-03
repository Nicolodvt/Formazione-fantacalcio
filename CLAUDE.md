# App Formazione — Diario di bordo

**Stato: v0.1 (03/09/2026).** Fasi 0 e 1 chiuse. L'app schiera, sceglie il modulo e funziona
offline. Il fetcher gira a mano ma **non è ancora schedulato in cloud**: manca il repo su GitHub.
Traguardo: **4ª giornata**.

Progetto separato dall'app asta, che vive nella cartella superiore. Quella serve a *comprare* ed è
finita lunedì; questa serve a *schierare* e deve reggere 38 giornate.

## File

- `index.html` — l'app. Single-file, stessa filosofia dell'asta: CSS in `<style>`, listone in
  `<script id="listone-data">`, logica in un unico IIFE. Nessuna dipendenza esterna.
- `manifest.webmanifest` + `sw.js` — installazione e funzionamento offline. Hanno effetto solo se
  la cartella è servita via http/https.
- `tools/fetch-probabili.mjs` — lo scraper. **Gira solo in CI, mai nel browser.**
- `dati/probabili.json` — output dello scraper, letto dall'app con fetch same-origin.
- `.github/workflows/dati.yml` — il cron. Scritto, **mai eseguito**: serve il repo remoto.

## La decisione che regge tutto: fetcher fuori dall'app

fantacalcio.it non manda header CORS. Un `index.html` aperto nel browser **non può** chiamarlo, né
può chiamare leghe.fantacalcio.it. Verificato anche che `fantacalcio.it/api/v1/Excel/votes/21/1`
risponde `401` senza account.

Quindi le due cose richieste — "single-file autosufficiente come l'asta" e "i dati arrivano da
soli" — non stanno insieme senza un pezzo che gira su un server. La soluzione è **separare chi
scarica da chi decide**:

```
GitHub Action (5×/sett.)  →  dati/probabili.json  →  app (fetch same-origin)
   fragile, sacrificabile        il contratto          stupida, autosufficiente
```

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

## Da fare

1. **Mettere il repo su GitHub e collegare Netlify** (sito separato da quello dell'asta). Finché
   non è fatto, `dati.yml` non gira: c'è ma non è mai stato eseguito, e i dati vanno aggiornati a
   mano con `node tools/fetch-probabili.mjs`.
2. Fase 3 — voti a giornata conclusa, storico, medie voto misurate al posto delle stimate.
   L'endpoint vuole un account fantacalcio.it: la password va messa come GitHub Secret
   dall'utente, non passa da qui.
3. Fase 4 — mercato di riparazione e svincoli.
4. Provare installazione e offline **sul telefono vero**.

**Aperto, non bloccante:** il regolamento della lega (moduli ammessi, numero di cambi, soglie del
modificatore). Si è partiti con i default: sono costanti in testa al file, sotto *COSTANTI DI
LEGA*, e cambiarle non tocca altro.
