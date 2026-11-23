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
În lobby hostul alege 3/5/7 runde, power-up-uri da/nu și cât de des apar (1 rar … 5 haos), boții (până la 6 mașinuțe, fiecare bot cu nivelul lui), apoi Start.
La final: podiumul (primii trei urcă pe trepte, artificii pentru câștigător), clasamentul meciului și premiile:
Bătăușul (cei mai mulți scoși din ring), Kamikaze (cele mai multe ieșiri singur), Neclintitul (cele mai puține
ieșiri), Ciocănarul (cele mai multe lovituri), Colecționarul (cele mai multe power-up-uri), Uriașul (cei mai
mulți scoși din ring cât era mare de la Pudra proteică). Apoi hostul îi duce
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

Cât de des apar alege hostul din lobby, de la 1 la 5 (implicit 3), cel mult două odată, într-un loc liber,
departe de margine și de mașini:

| Nivel | Primul după START | Apoi la fiecare |
|---|---|---|
| 1 rar | 12 s | 12–18 s |
| 2 din când în când | 10 s | 8–14 s |
| 3 des (implicit) | 7 s | 5–9 s |
| 4 foarte des | 5 s | 3–6 s |
| 5 haos | 3 s | 2–4 s |
 Le iei trecând peste ele și se activează pe loc; dacă nu le ia nimeni, dispar după 10 s
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
| Suc Zero Zahăr | 5 s: viteză maximă ×1,6 și accelerație ×1,5, dar aderență mai mică: poți ieși singur din ring; dâră de bule |
| Pudră proteică | 6 s: crești treptat (~0,3 s) la ~1,7× rază (cam cât 3 mașini) și masă ×3, puțin mai lent la accelerație; apoi revii treptat. Ieși tot după centrul mașinii |
| Fantomă | 5 s: invizibil pentru ceilalți (doar o sclipire slabă la ~1 s) și de neatins: treci prin mașini, Claxonul nu te mișcă, boții nu te văd; uleiul te prinde și poți ieși singur. Pâlpâie în ultima secundă; dacă reapari peste cineva, vă despărțiți lin, fără +1 |

Boții merg după ele când sunt aproape și nu e periculos (Greu alege mai bine, Ușor le ignoră des) și știu să le
folosească: cu Mici, Arcuri, Țuică sau mari de la Proteină atacă, cu Colacul se apropie mai curajos de margine.
Greu țintește cu Sucul rivalii de lângă margine și fuge de uriași; Ușor e luat prin surprindere de viteza Sucului.
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
| `fasait.ogg` | e luat Sucul Zero Zahăr |
| `ragait.ogg` | se termină Sucul Zero Zahăr |
| `flex.ogg` | e luată Pudra proteică |
| `fantoma.ogg` | e luată Fantoma |

Butonul de sunet le oprește pe toate, muzica inclusiv.

## Opțiuni de test în URL

`?bots=1..5`, `?rounds=3|5|7`, `?seed=abc`, `?botlevel=usor|mediu|greu`, `?debug` (hitbox-uri, vectori, ce fac boții, power-up-uri și când apare următorul),
`?touch` / `?touch=0` (forțează controalele de telefon), `?tune` (panou cu reglaje pentru condus și power-up-uri, cu
„Copiază valorile”), `?powerups=0` (meci local fără power-up-uri) și `?pufreq=1..5` (cât de des apar).
Toate în afară de `?touch` sar peste meniuri direct într-un meci local. Reglajele salvate din `?tune` se aplică doar
cu `?tune` în URL și niciodată într-un joc online.

Pentru jocul online: `?lag=120&jitter=30` simulează o rețea lentă (120 ms în plus dus-întors, până la 30 ms aleator
pe fiecare mesaj), iar `?online` păstrează meniurile ca `?debug` să arate și ping-ul, eroarea de predicție,
inputurile neconfirmate și corecțiile mari pe secundă (de exemplu `?online&debug&lag=120&jitter=30`).

## Varianta 3D (la `/3d/`)

Aceleași meniuri, același lobby și aceleași camere ca jocul 2D: un jucător 2D și unul 3D intră cu același cod și joacă
împreună. În meniul 2D, „Încearcă în 3D” deschide varianta 3D (cu aceeași poreclă și aceleași setări); în 3D, „Înapoi
la 2D” face drumul invers. Pe un dispozitiv pe care 3D-ul merge sub 40 de cadre pe secundă la prima pornire, jocul
sugerează o dată varianta 2D. Pornește `npm run dev` (server + 2D) și `npm run dev:3d` → http://localhost:5175/3d/ (de pe telefon:
`http://<IP-ul PC-ului>:5175/3d/`). Linkul de invitație dintr-un lobby 3D duce la `/3d/?room=COD`.

Are sunetele și muzica din 2D (aceleași fișiere înlocuibile din `client/public/audio/`, cu sunet mai încet departe de
mașina ta și poziționat stânga-dreapta), bâlciul în jur (roata mare, corturi, vată de zahăr, ghirlande, stele), podium
3D cu artificii, clasamentul și premiile. Opțiunile de test din 2D merg și aici (`?bots=5&seed=abc&botlevel=greu`
pornește direct un meci local, `?debug` arată hitbox-urile și intențiile boților), plus `?perf`
(FPS, timp pe cadru, draw calls, triunghiuri, ping online) și `?quality=low|high`. În „Setări”: calitatea grafică
camera de la începutul meciului și harta mică. Tasta C (sau butonul „Cameră”) schimbă camera; în camera din spate joystick-ul
e rotit după cameră (sus = înainte). Harta mică (jos în dreapta, pe telefon sus lângă butoane; tasta M o ascunde)
arată ringul văzut de sus, rotit după cameră: mașinile, power-up-urile și bălțile de ulei. Fără HMR: `npm run build:3d`, apoi `npm run preview:3d` → `http://<IP>:4175/3d/`.

## Publicare

Pe VPS, la https://masinute-balci.duckdns.org: `.\deploy\push.ps1` (teste, build, upload, health check, rollback
automat). Prima instalare și toți pașii: [`deploy/README.md`](deploy/README.md).

Tehnologii: Phaser 3, TypeScript, Vite, Colyseus. Simularea (în `shared/`) e deterministă și rulează
la fel în browser și pe server.
