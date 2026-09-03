# Appunti della notte 03→04/09/2026

File di lavoro, non documentazione. Serve a ritrovare il filo dopo ogni risveglio.
A fine notte va riassunto in CLAUDE.md e cancellato.

## Stato lista

- [x] 1. QA via click UI reali — FATTO, 1 bug trovato (bersagli da dito) e corretto
- [x] 2. Casi limite — FATTO, tutti gestiti senza errori
- [x] 3. netlify.toml — FATTO
- [ ] 4. Ricerca fonti dati + fattibilità API + costi
- [ ] 5. Esplorazione grafica su branch separato
- [ ] 6. Scaffolding scraper voti
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
