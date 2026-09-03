# App Formazione — Diario di bordo

**Stato: v0.1 in costruzione (03/09/2026).** Fase 0 chiusa con esito positivo: lo scraper delle
probabili funziona e l'aggancio con il listone è esatto. Traguardo: **4ª giornata**.

Progetto separato dall'app asta, che vive nella cartella superiore. Quella serve a *comprare* ed è
finita lunedì; questa serve a *schierare* e deve reggere 38 giornate.

## File

- `index.html` — l'app. Single-file, stessa filosofia dell'asta: CSS in `<style>`, dati in
  `<script id="...">`, logica in un unico IIFE. Nessuna dipendenza esterna.
- `manifest.webmanifest` + `sw.js` — installazione e funzionamento offline. Hanno effetto solo se
  la cartella è servita via http/https.
- `tools/fetch-probabili.mjs` — lo scraper. **Gira solo in CI, mai nel browser.**
- `dati/probabili.json` — output dello scraper, letto dall'app con fetch same-origin.
- `.github/workflows/` — il cron che fa girare lo scraper.

## La decisione che regge tutto: fetcher fuori dall'app

fantacalcio.it non manda header CORS. Un `index.html` aperto nel browser **non può** chiamarlo, né
può chiamare leghe.fantacalcio.it. Verificato anche che `fantacalcio.it/api/v1/Excel/votes/21/1`
risponde `401` senza account.

Quindi le due cose richieste — "single-file autosufficiente come l'asta" e "i dati arrivano da
soli" — non stanno insieme senza un pezzo che gira su un server. La soluzione è **separare chi
scarica da chi decide**:

```
GitHub Action (2×/sett.)  →  dati/probabili.json  →  app (fetch same-origin)
   fragile, sacrificabile        il contratto          stupida, autosufficiente
```

Conseguenze, tutte volute:
- **Nessuna credenziale nel browser.** Niente password in un file che chiunque guardi lo schermo
  può leggere.
- **Niente CORS**: il file è servito dalla stessa origine dell'app.
- **Offline funziona**: il service worker cachea anche i JSON.
- **Se il fetcher muore, l'app non muore.** Continua con l'ultimo file buono, *dichiarando* la
  data del dato, e lascia l'inserimento manuale come rete di sicurezza. Stessa disciplina del
  banner `#noSaveBar` dell'asta: degradare dicendolo.

**Sito Netlify separato da quello dell'asta.** Il `sw.js` dell'asta ha `scope:"./"`, strategia
network-first che cachea *ogni* GET e fallback a `./index.html`: servita dalla stessa origine,
questa app verrebbe intercettata e in offline mostrerebbe l'app asta.

## L'aggancio: id di fantacalcio.it (verificato)

**Gli `id` del listone dell'asta SONO gli id di fantacalcio.it.** Malen è `5585` nel listone e in
`fantacalcio.it/serie-a/squadre/roma/malen/5585`; Svilar è `5841` in entrambi.

Verifica del 03/09 su 480 giocatori estratti dalle probabili di G3:

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

HTML servito dal server, nessun JavaScript da eseguire per leggerlo. Struttura stabile e regolare:

- `class="matchweek"` → numero di giornata
- `<li class="match match-item">` → una partita; dentro, due `card team-card` (prima la casa)
- `class="h6 team-name"` / `class="h6 team-formation"` → squadra e modulo
- `player-list starters` / `player-list reserves` → 11 + 13
- per ogni giocatore: `data-status` (`success` | `warn`), `class="role" data-value="p|d|c|a"`,
  `aria-valuenow="90"` (percentuale), link con l'id
- sezioni `suspendeds`, `injureds`, `dubts`, `cautioneds`, `ballots`

`data-championship-id="21"` = Serie A 2026/27. È lo stesso `21` dell'endpoint dei voti: servirà.

**Chi non compare nelle probabili non è un buco, è un'informazione.** Verificato: McTominay,
Orsolini e Zaniolo mancano dai 24 e sono tutti e tre in `injureds` con la motivazione. Quindi:
in probabili → si sa quanto è dato titolare; assente ma in `injureds`/`suspendeds` → si sa perché;
assente e basta → è fuori dai 24, non giocherà.

## Correzione a un errore ereditato

Il CLAUDE.md dell'app asta, sotto *Limiti dichiarati*, sostiene che il listone "non corrisponde a
una Serie A reale" perché contiene Frosinone, Monza, Venezia e Sassuolo, e su quella premessa
scarta tutte le fonti esterne.

**È falso.** Sono esattamente le 20 squadre della Serie A 2026/27: Frosinone, Monza e Venezia sono
le promosse dalla B, Sassuolo era già in A. È questa correzione che rende possibile tutto il
progetto. Da sistemare anche in quel file, quando l'asta sarà passata.

## Regole di lavoro ereditate dall'app asta

Valgono identiche qui, e sono state imparate sbagliando:

- **Dopo ogni modifica per intervallo**, oltre a `node --check`, confrontare contro un backup su
  (a) funzioni definite, (b) `addEventListener` registrati, (c) `el('#id')` che puntano a elementi
  inesistenti. Una sostituzione "da qui a lì" può cancellare interi blocchi lasciando il codice
  sintatticamente valido.
- **Per il CSS**, `comm -23` tra i selettori vecchi e nuovi. Una regola persa non dà errore:
  l'elemento resta lì senza stile.
- **Poi guardarla davvero, a 375px.** I controlli automatici dicono che il codice c'è, non che si
  vede bene.
- Qui in più c'è **git**, che l'app asta non ha: commit piccoli e frequenti, così un blocco
  cancellato si recupera invece di essere riscritto a memoria.

## Da fare

1. Fase 1 — l'app che schiera (in corso).
2. Fase 2 — GitHub Action schedulata + deploy Netlify.
3. Fase 3 — voti a giornata conclusa, storico, medie voto misurate al posto delle stimate.
4. Fase 4 — mercato di riparazione e svincoli.

**Aperto, non bloccante:** il regolamento della lega (moduli ammessi, numero di cambi, soglie del
modificatore). Si parte con i default, sono costanti in testa al file.
