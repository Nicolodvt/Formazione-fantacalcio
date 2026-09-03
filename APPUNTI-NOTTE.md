# Appunti della notte 03→04/09/2026

File di lavoro, non documentazione. Serve a ritrovare il filo dopo ogni risveglio.
A fine notte va riassunto in CLAUDE.md e cancellato.

## Stato lista

- [x] 1. QA via click UI reali — FATTO, 1 bug trovato (bersagli da dito) e corretto
- [x] 2. Casi limite — FATTO, tutti gestiti senza errori
- [x] 3. netlify.toml — FATTO
- [x] 4. Ricerca fonti dati — FATTO (vedi sotto)
- [ ] 5. Esplorazione grafica su branch separato
- [x] 6. Scaffolding scraper voti — FATTO e validato su G1+G2
- [ ] 7. Sanity check fantamedia
- [ ] 8. Feature e fix (continuo)
- [ ] 9. Verifica con subagent
- [ ] 10. Memoria aggiornata

## Diario

### 23:56 — partenza
Reti di sicurezza armate: cron one-shot 04:03 (reset limiti utente) + watchdog orario :47.
Stato git di partenza: ff4b028 "Campo elastico, avviso dati vecchi, diario aggiornato".
Remote su origin/main, Netlify pubblica e verificata.

### 00:35 — punti 1, 2, 3 chiusi

**QA interfaccia.** Il pannello browser resta nascosto tutta la notte, quindi i click veri del
mouse vanno in timeout. Aggirato cosi: il wiring verificato con click DOM sui listener, e la parte
che sarebbe sfuggita (elementi coperti, bersagli troppo piccoli) misurata con elementFromPoint.
E stato proprio quel test geometrico a trovare l'unico bug vero della serata.

Flussi verificati, tutti a posto: import (testo non-JSON, schema sbagliato, import buono),
correzioni a mano (Gioca/Dubbio/Fuori/Auto), fissaggio e cambio slot con ripristino, componi a
mano (ricerca, reparto pieno rifiutato, rimozione), impostazioni (reset correzioni, testo
formazione da copiare).

**Casi limite**, nessun errore JavaScript in nessuno:
- rosa vuota: schermata iniziale corretta in tutte e tre le viste
- un solo giocatore: 10 caselle vuote, modificatore assente
- zero portieri: casella "manca", modificatore assente
- 11 esatti senza panchina: avvisa che il modificatore salta il 25% delle volte, non avendo sostituti
- niente attaccanti: l'ottimizzatore mette in cima 5-4-1 e 4-5-1, cioe i moduli che sprecano meno
  caselle vuote. Comportamento sensato emerso da solo dalla simulazione, non programmato a mano.

**netlify.toml**: no-cache su sw.js (con Service-Worker-Allowed), index.html, manifest e dati/*.
Il rischio evitato e il piu insidioso delle PWA: un CDN che serve un service worker vecchio e
un'app che non si aggiorna mai piu, senza che l'utente possa accorgersene.

### 01:00 — punti 4 e 6: fonti dati e scraper voti

**Cosa e raggiungibile senza login** (sondato lato server):

| fonte | esito |
|---|---|
| voti di giornata | pubblica, servita dal server, 319 giocatori — USABILE |
| statistiche stagionali | pubblica, 592 giocatori — la fonte per le medie voto reali |
| infortunati | pubblica, ma NON usa i link con id: struttura da capire |
| squalificati | pubblica, 45 KB, nessuna tabella: forse vuota o caricata via JS |
| calendario | pubblica, ma mostra solo la giornata corrente |
| API /api/v1/Excel/votes | 401, serve account. NON usata: non serve |

**Scraper voti fatto** (`tools/fetch-voti.mjs`), validato su G1 e G2: 293 voti per giornata,
media 5.98 e 5.96 — esattamente il valore atteso per il calcio. Incrocio col listone: 95-98%
agganciati, ZERO discordanze di ruolo.

Due trappole trovate e disinnescate, nessuna delle quali dava errore:

1. **Tre colonne di voto, non una.** Il sito pubblica Redazione Fantacalcio, Voto Statistico e
   Voto Italia affiancate. La nostra lega usa la PRIMA. Prendere la colonna sbagliata non
   avrebbe dato alcun errore, solo uno storico interamente falso. Lo script ora verifica
   l'ordine leggendo le icone di intestazione e si ferma se cambia.
2. **"Senza voto" e codificato come 55.** Non come casella vuota. Preso per buono dava una media
   di giornata di 9.98, impossibile. Verificato che tutte e 28 le righe con 55 portano l'icona
   "Subentrato": sono entrati troppo tardi per essere giudicati. E stata la validazione sulla
   media a intercettarlo — senza, sarebbe passato in silenzio.
