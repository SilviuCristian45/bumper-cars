# Mașinuțe de Bâlci

Joc multiplayer în browser cu mașinuțe tamponate, văzut de sus, într-o arenă de bâlci românesc noaptea.
Până la 6 jucători: intri la un prieten cu un cod de 6 caractere sau joci offline cu boți.

**În construcție.** Etapele sunt în `CLAUDE.md`.

## Pornire

```bash
npm install
npm run dev     # client pe http://localhost:5174, server pe :2568
npm test
npm run sim -- --bots usor,mediu,greu,greu --rounds 5 -v   # un meci doar cu boți, în terminal
```

Nivelurile boților: `usor`, `mediu`, `greu` (2–6 boți). `--seed` schimbă meciul, `-v` arată fiecare eliminare.

## Controale

- Tastatură: săgeți sau WASD (stânga/dreapta = viraj, sus = accelerație, jos = frână și marșarier), Spațiu = boost, P = pauză, Esc = ieși, F = ecran complet.
- Sus în dreapta: sunet pornit/oprit și ecran complet. Muzica de bâlci se oprește separat: „Muzică” din „Setări”
  (telefon) sau din colțul meniului (calculator).
- Telefon (pe orizontală): joystick în stânga (mașina virează spre direcția lui și accelerează cât îl împingi), buton de boost în dreapta. Din „Setări”: mod stângaci, vibrații, efecte reduse.

## Cum se joacă

Intro → porecla → meniu: „Creează joc”, „Intră la un prieten” (cod de 6 caractere) sau „Joacă offline cu boți”.
În lobby hostul alege 3/5/7 runde, power-up-uri da/nu și boții (până la 6 mașinuțe, fiecare bot cu nivelul lui), apoi Start.
La final: podiumul (primii trei urcă pe trepte, artificii pentru câștigător), clasamentul meciului și premiile:
Bătăușul (cei mai mulți scoși din ring), Kamikaze (cele mai multe ieșiri singur), Neclintitul (cele mai puține
ieșiri), Ciocănarul (cele mai multe lovituri), Colecționarul (cele mai multe power-up-uri). Apoi hostul îi duce
pe toți înapoi în lobby.

Online: „Creează joc” dă un cod de 6 caractere și un link de invitație (`?room=COD`, „Trimite invitația” pe telefon,
„Copiază link” pe calculator). Cine pierde conexiunea are 15 secunde să revină; reîncărcarea paginii în acest
timp te readuce în același joc, cu aceeași mașinuță (dacă deschizi între timp linkul altui joc, ești întrebat
întâi dacă vrei să-l părăsești pe cel curent). Dacă serverul nu răspunde, meniul spune asta și propune jocul
offline cu boți.

Clasament all-time („Clasament” din meniu): intră doar meciurile online terminate cu cel puțin 2 oameni
(boții nu contează), cel mai bun meci al fiecărei porecle, după puncte și apoi runde câștigate. La finalul
meciului apare „Ai intrat în top!” sau „Record nou!”.

## Power-up-uri

Apar pe ring la ~10 s după START, apoi la fiecare 8–14 s, cel mult două odată, într-un loc liber, departe de
margine și de mașini. Le iei trecând peste ele și se activează pe loc; dacă nu le ia nimeni, dispar după 10 s
(clipesc înainte) sau când ringul care se strânge trece peste ele. O mașină are un singur efect de durată
odată: unul nou îl înlocuiește pe cel vechi (Claxonul și Uleiul sunt instantanee).

| Power-up | Ce face |
|---|---|
| Claxon de TIR | undă de șoc: împinge mașinile din jur (rază ~3 mașini), mai tare cele apropiate; contează ca lovitură (+1 dacă ies) |
| Mici cu muștar | 6 s: masă dublă și puțin mai lent; greu de mișcat, lovește tare |
| Colac de salvare | următoarea ieșire din ring e anulată: mașina e respinsă spre centru; ține până se folosește sau 10 s |
| Ulei vărsat | o baltă în urma ta, 8 s: pe ea mașinile (nu și tu) alunecă; cine iese de pe ea îți dă +1 (în 3 s) |
| Țuică de prună | primul pe care îl lovești are virajul inversat 4 s (apare un „?” deasupra lui); ține până lovești sau 8 s |
| Bară cu arcuri | 5 s: loviturile tale îi împing pe ceilalți de 2× mai tare |

Boții merg după ele când sunt aproape și nu e periculos (Greu alege mai bine, Ușor le ignoră des) și știu să le
folosească: cu Mici, Arcuri sau Țuică atacă, cu Colacul se apropie mai curajos de margine.
Duratele și puterile se reglează din `?tune` (doar local). Fără power-up-uri, simularea e exact cea dinainte.

## Sunete și muzică înlocuibile

Efectele și muzica sunt generate cu Web Audio. Oricare poate fi înlocuit punând un fișier cu numele lui în
`client/public/audio/` (`.ogg`, sau `.mp3` dacă nu există `.ogg`); un fișier lipsă înseamnă sunetul generat.

| Fișier | Când se aude |
|---|---|
| `muzica.ogg` | muzica de bâlci, în buclă, încet (generată: un vals de orgă de carusel) |
| `bonk.ogg` | două mașini se lovesc (mai tare la o lovitură mai puternică) |
| `boost.ogg` | boost |
| `iesire.ogg` | o mașină iese din ring |
| `numaratoare.ogg` | 3, 2, 1 la începutul rundei |
| `start.ogg` | START! |
| `ring.ogg` | ringul începe să se strângă |
| `runda.ogg` | cineva câștigă o rundă |
| `final.ogg` | podiumul de la finalul meciului (fanfară) |
| `claxon.ogg` | Claxon de TIR |
| `ridicare.ogg` | e luat un power-up |
| `sughit.ogg` | Țuică: cineva rămâne cu virajul inversat |
| `boing.ogg` | o lovitură cu Bară cu arcuri |
| `colac.ogg` | Colacul de salvare salvează o mașină |

Butonul de sunet le oprește pe toate, muzica inclusiv.

## Opțiuni de test în URL

`?bots=1..5`, `?rounds=3|5|7`, `?seed=abc`, `?botlevel=usor|mediu|greu`, `?debug` (hitbox-uri, vectori, ce fac boții, power-up-uri și când apare următorul),
`?touch` / `?touch=0` (forțează controalele de telefon), `?tune` (panou cu reglaje pentru condus și power-up-uri, cu
„Copiază valorile”) și `?powerups=0` (meci local fără power-up-uri).
Toate în afară de `?touch` sar peste meniuri direct într-un meci local. Reglajele salvate din `?tune` se aplică doar
cu `?tune` în URL și niciodată într-un joc online.

Pentru jocul online: `?lag=120&jitter=30` simulează o rețea lentă (120 ms în plus dus-întors, până la 30 ms aleator
pe fiecare mesaj), iar `?online` păstrează meniurile ca `?debug` să arate și ping-ul, eroarea de predicție,
inputurile neconfirmate și corecțiile mari pe secundă (de exemplu `?online&debug&lag=120&jitter=30`).

## Publicare

Pe VPS, la https://masinute-balci.duckdns.org: `.\deploy\push.ps1` (teste, build, upload, health check, rollback
automat). Prima instalare și toți pașii: [`deploy/README.md`](deploy/README.md).

Tehnologii: Phaser 3, TypeScript, Vite, Colyseus. Simularea (în `shared/`) e deterministă și rulează
la fel în browser și pe server.
