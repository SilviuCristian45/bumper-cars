# Audit de securitate: Mașinuțe de Bâlci

Data: 2026-11-20. Versiune auditată: commit `50f1a45` (Stage 6). Faza 1: doar citire de cod și verificări **locale**
(un server pornit pe `127.0.0.1:2570`, nimic pe VPS). Nicio modificare de cod în faza asta.

Referințe: OWASP Top 10 (2021), OWASP WebSocket Security Cheat Sheet, OWASP Input Validation / XSS Prevention,
documentația Colyseus 0.18 (matchmaker, `onAuth`, `setPrivate`, `maxMessagesPerSecond`, transportul `ws`),
documentația Caddy v2 (`reverse_proxy`, `header`), sursa instalată din `node_modules/@colyseus/*`
(core 0.18.29, ws-transport 0.18.5).

## Rezumat

| # | Severitate | Problemă | Verificat local |
|---|---|---|---|
| C1 | **critic** | Oricine blochează tot jocul cu 20 de cereri HTTP la 15 s (`MAX_ROOMS` global, fără limită per IP) | da |
| M1 | **mare** | Intri în jocul altcuiva fără cod: `/matchmake/join` și `joinOrCreate` aleg orice lobby deschis | da |
| M2 | **mare** | Nicio limită per IP (conexiuni WebSocket, matchmake, GET-uri); CORS acceptă orice site, fără verificare de Origin | parțial |
| M3 | **mare** (blochează reparațiile) | IP-ul pe care îl vede Colyseus (`context.ip`) se poate falsifica prin `X-Real-IP` trecut neschimbat de Caddy | din cod |
| D1 | mediu | Clasamentul se poate umfla cu 2 taburi; porecla nu aparține nimănui; variante de diacritice/homoglife | din cod |
| D2 | mediu | Coduri de cameră ghicibile prin `/rooms/:code` și `joinById` fără limită | calcul |
| D3 | mediu | Lipsesc header-ele de securitate (CSP, HSTS, nosniff, frame-ancestors, Referrer-Policy) | din config |
| D4 | mediu | Un lobby cu un singur client conectat trăiește la nesfârșit (ocupă un loc din `MAX_ROOMS`) | din cod |
| m1 | mic | Codurile de cameră din `Math.random` (predictibil), nu din `crypto` | din cod |
| m2 | mic | Porecle: zalgo, caractere invizibile care nu sunt `Cf`, separatori de linie, fără NFC, nume identice | din cod |
| m3 | mic | `/health` public: arată câte camere sunt și când serverul e plin | da |
| m4 | mic | Opțiunea `name` la join poate avea ~1 MB (procesată înainte de tăiere) | da |
| m5 | mic | Hardening systemd suplimentar posibil (fără ieșire în rețea, `ProtectProc`, capabilități) | din config |
| i1 | info | Caddy fără log de acces; un flood la nivel de Caddy afectează și Bombe și trenul | — |

Prioritatea propusă pentru faza 2: **M3 → C1 + M2 + D4 → M1 → D2 + m1 → D1 → D3 → m2–m5**.
M3 primul pentru că orice limită per IP fără el e ocolită cu un header.

---

## Faza 2: ce s-a reparat (2026-11-20)

Commit-uri `6fafdb7` (M3, C1, M2, D4), `3fa8153` (M1), `44f3174` (D2, m1), `d25e14c` (D1, m2, m4),
`cbc6e3b` (D3, M3 în Caddy, m3, m5: pregătite în `deploy/`). Teste: `server/test/security.test.ts` (29),
`shared/test/match.test.ts` (porecle); toate trec (shared 136, client 5, server 70), typecheck curat.

| # | Stare | Ce s-a făcut |
|---|---|---|
| M3 | reparat în cod; Caddy pregătit | `server/src/clientIp.ts`: adresa vine doar din **ultimul** element `X-Forwarded-For` (cel pus de Caddy) și doar de la loopback; IPv6 pe /64. `context.ip` din Colyseus nu e folosit. Fără Caddy în față (dev, teste, curl pe VPS): limitele per IP sunt oprite și se loghează un avertisment (cel mult o dată la 10 min). Caddy: `header_up X-Real-IP {remote_host}`, `header_up -X-Client-IP`. Merge corect și înainte de schimbarea Caddy, pentru că Caddy suprascrie deja `X-Forwarded-For` |
| C1 | reparat | `static onAuth` pune cheia IP în opțiuni, `onCreate` refuză a 5-a cameră vie a aceleiași adrese (`ERR_TOO_MANY_ROOMS`, mesaj românesc); maxim 6 creări/minut/adresă |
| M2 | reparat | `server/src/guard.ts` în fața listener-elor Colyseus: rate limit per adresă (matchmake 30+60/min, `/rooms` 20/min, `/leaderboard` 30/min, deschideri WS 30+60/min), maxim 24 WebSocket-uri deschise per adresă, `Origin` doar `https://masinute-balci.duckdns.org` (plus localhost în afara producției), CORS fără `Allow-Credentials`; 429 cu `Retry-After` |
| D4 | reparat | lobby fără Start închis după 20 min (`CLOSE_LOBBY_IDLE`, „Jocul a fost închis: a stat prea mult în lobby…”) |
| M1 | reparat | `setPrivate(true)` + doar `create`/`joinById`/`reconnect` expuse |
| D2 | reparat | fiecare adresă are 20 de coduri inexistente, apoi 4/min (join, reconnect, `/rooms/:code`); după epuizare **nici codurile reale nu primesc răspuns**, deci nu se poate distinge o nimereală. 5 greșeli de tastare la rând încă merg |
| m1 | reparat | coduri din `crypto.randomInt`, seed din `crypto.randomBytes` |
| D1 | parțial (cum s-a cerut) | porecle normalizate (NFC, ș/ț cu virgulă, majuscule în `nameKey`, fără caractere invizibile/de control, zalgo maxim 2 semne); migrația 2 unește rândurile vechi cu ş/ţ; maxim 30 de **meciuri** salvate per adresă pe zi UTC (jucătorii de la o adresă peste limită sunt lăsați afară din salvare, ceilalți intră). Fără proprietate a poreclei |
| m2 | reparat | vezi D1; plus nume deja luat în cameră → „Ana 2” |
| m4 | reparat | porecla brută e tăiată înainte de procesare; `onAuth` refuză opțiuni care nu sunt obiect |
| D3 | pregătit, neaplicat | header-e în `deploy/Caddyfile`: HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, **CSP Report-Only** cu `report-uri /colyseus/csp-report` (serverul scrie încălcările în jurnal) |
| m3 | pregătit, neaplicat | Caddy răspunde 404 la `/colyseus/health`, `/colyseus/__healthcheck`, `/colyseus/` (versiunea Colyseus); `push.ps1` verifică acum `/colyseus/leaderboard` |
| m5 | pregătit, neaplicat | `deploy/masinute.service`: rețea doar loopback (`IPAddressDeny=any`/`IPAddressAllow=localhost`), fără capabilități, `ProtectProc`, `SystemCallFilter=@system-service` (EPERM, nu kill), `UMask=0077` etc. |

**Atac înainte / după, verificat local** (același script, trimis „ca prin Caddy”, contra codului de la
`4b6456a` pe portul 2571 și contra codului nou pe 2570):

| Atac | Înainte | După |
|---|---|---|
| C1+M3: camere create de o adresă din 25 (cu `X-Real-IP` nou la fiecare) | 20 (server plin) | 4 |
| M1: `join` fără cod | 200, intrat în camera altcuiva | refuzat (520) |
| M2: WebSocket-uri acceptate de la o adresă din 40 | 40 | 24 |
| M2: create de pe `https://evil.example` | CORS reflectat cu `Allow-Credentials: true` | 403, fără CORS |
| M2: WebSocket de pe `https://evil.example` | 101 | 403 |
| D2: coduri ghicite care primesc răspuns din 60 | 60 | 20 |

**CSP verificat local:** build-ul de producție servit cu exact header-ul din `deploy/Caddyfile` (forțat, nu
Report-Only, ca o încălcare să se și vadă), Chrome headless dirijat prin DevTools: intro → nume → meniu →
Creează (online) → lobby → +Bot → Start → joc; meci offline cu boți și power-up-uri; Clasament. Desktop și
telefon emulat (844×390, touch, `?touch`): **0 încălcări, 0 excepții**. Control negativ: o imagine de pe alt
domeniu a fost blocată și raportul a ajuns în jurnalul serverului prin `/colyseus/csp-report`.

**Rămas:**
- de aplicat pe VPS, cu acordul tău: Caddy (`caddy-update.sh`, comenzile în `deploy/README.md`), apoi `push.ps1`,
  apoi `setup.sh` pentru unit-ul systemd + `systemd-analyze security masinute`;
- `deploy/Caddyfile` nu a fost validat cu un Caddy real local (descărcarea a fost blocată); `caddy-update.sh`
  rulează `caddy validate` pe VPS înainte să scrie și are `--dry-run`;
- CSP pe un telefon real, după deploy: `journalctl -u masinute | grep CSP:`; apoi trecerea la
  `Content-Security-Policy`;
- D1: un jucător care stă pe loc tot meciul (tab de umplutură) încă face meciul să conteze; propunere: un om
  contează doar dacă a jucat efectiv;
- i1: log de acces Caddy (neinclus: date personale + verificarea directorului `/var/log/caddy`);
- limitele per adresă sunt în memorie: un restart (deploy) le golește, inclusiv cota zilnică de clasament.

**Incident în timpul fazei 2:** o comandă locală de editare a README-ului a executat accidental, prin
backtick-uri interpretate de shell, `ssh oracle "rm -rf ~/masinute-deploy"`. Pe VPS a fost șters doar folderul
`/home/ubuntu/masinute-deploy` (copia lui `deploy/` de la ultimul `setup.sh`); serviciul, baza de date, Caddy,
Bombe și trenul nu au fost atinse, iar comenzile următoare au eșuat fără efect. Folderul se recreează la pasul 1
din procedura Caddy.

---

## C1 (critic): blocarea serverului cu 20 de camere goale

**Unde:** `server/src/MasinuteRoom.ts:68` (`if (roomCount() >= MAX_ROOMS) throw ...`), `server/src/config.ts:8`
(`MAX_ROOMS = 20`), rutele Colyseus `POST /matchmake/create/masinute`.

**Exploatare (verificată local):** un singur client, fără să deschidă vreun WebSocket, a creat 20 de camere în
sub o secundă; a 21-a cerere: `{"code":4001,"error":"Serverul e plin"}`. Fiecare cerere rezervă un loc pentru
15 s (`COLYSEUS_SEAT_RESERVATION_TIME`); camera se închide după aceea, deci un `curl` în buclă (20 cereri la
~14 s) ține serverul plin permanent. Toți jucătorii văd „Serverul e plin” la „Creează joc”. Varianta cu
WebSocket-uri (20 de conexiuni care stau în lobby) nu are nici măcar nevoie de buclă (vezi D4).

**Reparație propusă:**
- `static onAuth(token, options, context)` în `MasinuteRoom` (rulează la matchmake, înainte de `onCreate`):
  maxim `MAX_ROOMS_PER_IP` camere vii create de același IP (contor în `registry.ts`, eliberat în `onDispose`).
- Rată de creare per IP (token bucket): ex. 5 camere/minut.
- IP-ul vine din M3 (nu din `context.ip` brut). IPv6 grupat pe /64 (un singur abonat are un /64 întreg).
- Opțional: `MAX_ROOMS` 20 → 30 (o cameră în lobby costă foarte puțin; timer-ul de 30 Hz rulează și în lobby,
  dar e ieftin). Hotărâm după măsurare locală.

**Impact asupra jucătorilor:** un grup de prieteni pe același Wi-Fi creează o cameră (rar 2). Valori propuse:
`MAX_ROOMS_PER_IP = 3`, 5 creări/minut. Un cămin/școală în spatele aceluiași NAT poate avea mai multe
grupuri: 3 camere simultane per IP e compromisul; valoarea e în config/env.

**Test (faza 2):** din același IP, a 4-a cameră e refuzată cu un cod nou (ex. `ERR_TOO_MANY_ROOMS`) și un mesaj
românesc; din alt IP merge; după `onDispose` IP-ul primește locul înapoi.

---

## M1 (mare): intrare în jocuri private fără cod

**Unde:** `MasinuteRoom.onCreate` nu apelează `setPrivate()`; Colyseus expune implicit
`exposedMethods: ["joinOrCreate", "create", "join", "joinById", "reconnect"]`
(`node_modules/@colyseus/core/build/matchmaker/controller.mjs:24`), iar `join`/`joinOrCreate` caută
`{ locked: false, private: false }` (`MatchMaker.mjs:179`).

**Exploatare (verificată local):** gazda creează camera `BWTTTN`; un al doilea client trimite
`POST /matchmake/join/masinute {"name":"Intrus"}` → `200`, `roomId: "BWTTTN"`. La fel `joinOrCreate`.
Fără cod, fără ghicit. Repetat, un atacator:
- intră în lobby-urile străinilor (poreclă jignitoare, apare în toast-uri și pe podium);
- **umple toate lobby-urile deschise** cu locuri rezervate (Colyseus numără rezervările la `maxClients`,
  `Room.mjs:458`): prietenii cu codul corect primesc „Jocul e plin”.

**Reparație propusă:** `this.setPrivate(true)` în `onCreate` (camera rămâne accesibilă prin `joinById`, adică
prin cod) **și** `matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect']` (clientul folosește
doar astea; de verificat în `client/src/net/rooms.ts` în faza 2). Ambele: setPrivate oprește găsirea camerei,
restrângerea metodelor oprește și `joinOrCreate` care altfel ar crea camere noi.

**Impact asupra jucătorilor:** niciunul (jocul nu are matchmaking „joacă cu oricine”).

**Test:** `POST /matchmake/join/masinute` → eroare chiar dacă există un lobby deschis; `joinById(cod)` merge.

---

## M2 (mare): nicio limită per IP, CORS deschis, fără verificare de Origin

**Unde:** `server/src/app.ts` (niciun middleware), `WebSocketTransport` fără `beforeUpgrade`
(`node_modules/@colyseus/ws-transport/build/WebSocketTransport.mjs:120`), CORS implicit Colyseus:
`Access-Control-Allow-Origin: <origin-ul cererii>` + `Access-Control-Allow-Credentials: true`
(verificat local: `Origin: https://evil.example` primește înapoi exact acel origin).

**Ce e deja bine aici (nu de atins):** `maxPayload` = 4 KB implicit în ws-transport (mesaje uriașe sunt
respinse de `ws` înainte de decodare), `perMessageDeflate` oprit (fără zip-bomb), `maxMessagesPerSecond = 60`
deconectează floodul de mesaje, coada de input e limitată la 4, socket-urile fără loc rezervat se închid după
1 s, `MemoryMax=250M` protejează Bombe și trenul de un Node umflat (în cel mai rău caz serviciul nostru e omorât
și repornit).

**Exploatare:**
- mii de upgrade-uri WebSocket/s de la un IP: fiecare costă un socket + handshake, chiar dacă se închide după
  1 s; event loop-ul și memoria cresc până la `MemoryMax` → restart → toate jocurile în curs se pierd;
- spam pe `POST /matchmake/*` (fiecare `create` construiește o cameră, vezi C1), pe `GET /rooms/:code` (oracol
  pentru D2) și `GET /leaderboard` (ieftin, servit din cache-ul de 30 s, deci risc mic);
- CORS + lipsa verificării de Origin: **orice site** poate pune în pagină un script care face browserele
  vizitatorilor lui să creeze camere / să deschidă WebSocket-uri la noi. Asta ocolește limitele per IP (vin de
  la mii de IP-uri reale). Nu există cookie-uri, deci nu e furt de sesiune (CSWSH clasic nu se aplică), dar e
  o cale ieftină de DoS distribuit.

**Reparație propusă (totul în Node, fără plugin-uri Caddy; Caddy din apt nu are `rate_limit`):**
- modul `server/src/limits.ts`: token bucket per IP (Map cu curățare periodică, memorie mărginită: maxim N IP-uri
  urmărite, cele vechi ies), folosit de:
  - `beforeUpgrade` al `WebSocketTransport`: maxim `MAX_WS_PER_IP` conexiuni simultane + rată de deschidere;
    `Origin` trebuie să fie în `ALLOWED_ORIGINS` (prod: `https://masinute-balci.duckdns.org`; dev:
    `http://localhost:5174` și IP-urile din LAN; listă din env);
  - un middleware pe rutele HTTP (`/matchmake/*`, `/rooms/*`, `/leaderboard`) → `429` cu `Retry-After`;
  - `matchMaker.controller.getCorsHeaders`: origin-ul doar dacă e în listă, fără `Allow-Credentials`.
- Clientul: un `429`/refuz devine un mesaj românesc („Prea multe încercări, mai așteaptă puțin”), ca celelalte
  erori din `net/rooms.ts`.

**Valori propuse (config + env), gândite pentru 6 prieteni pe același Wi-Fi:**

| Limită | Valoare | De ce încape un grup |
|---|---|---|
| `MAX_WS_PER_IP` (simultan) | 16 | 6 jucători + reconectări suprapuse (tab reîncărcat ține vechiul loc 15 s) + încă un grup mic |
| deschideri WS per IP | 30/min, rafală 15 | 6 intrări + reîncărcări |
| `POST /matchmake/*` per IP | 30/min, rafală 15 | 1 creare + 5 intrări + reconectări |
| `GET /rooms/:code` per IP | 20/min | apelat doar când o intrare e refuzată |
| `GET /leaderboard` per IP | 30/min | deschis manual din meniu |

**Test:** de la același IP (header-ul pus de „Caddy” simulat în test), al 17-lea WebSocket e refuzat, iar 6+6
merg; un `Origin` străin e refuzat la upgrade și la matchmake; răspuns CORS fără `Allow-Credentials`.

---

## M3 (mare, prerechizit): IP-ul real se poate falsifica

**Unde:** `node_modules/@colyseus/core/build/Transport.mjs:48`:

```js
resolveClientIp = firstHop("x-real-ip") ?? firstHop("x-forwarded-for") ?? firstHop("x-client-ip") ?? remoteAddress
```

Ia **primul** element și preferă `X-Real-IP`. Caddy (`deploy/Caddyfile`, `reverse_proxy` fără opțiuni)
suprascrie `X-Forwarded-For` cu IP-ul conexiunii (comportamentul implicit de la v2.5: header-ele
`X-Forwarded-*` venite de la un client care nu e în `trusted_proxies` nu sunt crezute), dar **trece neschimbate**
`X-Real-IP` și `X-Client-IP` venite de la client.

**Exploatare:** `curl -H 'X-Real-IP: 1.2.3.4' .../colyseus/matchmake/create/masinute` → serverul crede că
cererea vine de la 1.2.3.4. Azi nu folosește nimic `context.ip`, deci nu e exploatabil încă, dar orice limită
per IP construită pe `context.ip` (C1, M2) ar fi ocolită cu un header aleator la fiecare cerere.

**Reparație propusă (ambele, apărare în adâncime):**
1. Caddy: `header_up X-Real-IP {remote_host}` și `header_up -X-Client-IP` în blocul `reverse_proxy` (Caddy
   pune el valoarea, cea de la client dispare). Fără `trusted_proxies` (nu avem CDN în față).
2. Server: o funcție proprie `clientIp(headers, socketAddress)`: dacă socket-ul vine de pe loopback (Caddy),
   folosește `X-Real-IP` pus de Caddy (sau **ultimul** element din `X-Forwarded-For`); altfel adresa socket-ului.
   În producție, o cerere fără header (nu ar trebui să existe) intră într-un singur bucket „necunoscut”.
   IPv6 → prefixul /64. Nu folosim niciodată `context.ip` direct.

Portul 2568 ascultă doar pe 127.0.0.1 (`config.ts:4`, `masinute.service`), deci din internet nu se poate
ocoli Caddy. Rămâne teoretic: un alt proces de pe VPS (Bombe, trenul) ar putea vorbi direct cu 2568 cu orice
header; acceptabil.

**Test:** unitar pentru `clientIp` (header falsificat de la un peer ne-loopback e ignorat; ultimul hop din XFF
câștigă; IPv6 /64); test de cameră: două cereri cu `X-Real-IP` diferit de la un peer ne-loopback numără la
același IP.

---

## D1 (mediu): otrăvirea clasamentului

**Unde:** `server/src/leaderboard.ts` (`matchResult`: contează orice meci cu ≥ 2 oameni, `nameKey` =
`trim().toLowerCase()`), `MasinuteRoom.saveMatch`.

**SQL injection: nu există.** Toate interogările sunt `prepare(...)` cu parametri `?`; lista de nume merge ca
JSON prin `json_each(?)`; `MIGRATIONS` sunt constante. Nimic de reparat aici.

**Exploatare:**
- **2 taburi = 2 oameni.** Un singur om deschide 2–6 taburi, joacă din unul, celelalte stau pe loc și sunt
  scoase din ring. 7 runde × (3 victorie + 5 eliminări) ≈ 56 de puncte, repetabil, cu câte o poreclă nouă pe
  meci: în câteva ore cele 15 locuri sunt ale lui. Un script cu 2 clienți nici nu cere taburi.
- **Porecla nu aparține nimănui:** oricine joacă drept „Silviu” își adaugă meciul în rândul lui Silviu
  (rândul arată cel mai bun meci, iar numărul de meciuri crește).
- **Variante care ocolesc `nameKey`:** „ș” (U+0219) vs „ş” (U+015F), „ă” compus vs „a” + U+0306, chirilice
  care arată identic („Ѕilviu”) → rânduri separate care par același om.
- Porecle jignitoare permanente (nu există unealtă de ștergere).

**Reparație propusă (fără conturi, deci se poate doar ridica ștacheta):**
- un om contează doar dacă a **jucat efectiv**: a trimis input-uri care mișcă mașina într-o parte minimă din
  runde (ex. ≥ 60% din runde, cu throttle ≠ 0 în ≥ 3 s/rundă). Un meci se salvează doar cu ≥ 2 oameni activi.
  Tab-urile lăsate pe loc nu mai fac meciul să conteze;
- limită per IP: maxim `LEADERBOARD_SAVES_PER_IP_PER_DAY` (ex. 20) rezultate salvate pe zi;
- `nameKey`: NFC + ş→ș, ţ→ț (+ majuscule), apoi lowercase; pentru homoglife: refuzăm la `sanitizeName` amestecul
  de alfabete (latin + chirilic/grec în același nume);
- unealtă de administrare: `node index.js --remove-name "X"` (sau comenzi `sqlite3` documentate în
  `deploy/README.md`) pentru ștergerea unui nume.

**Impact asupra jucătorilor:** prietenii pe același Wi-Fi (același IP) continuă să intre în clasament: nu
cerem IP-uri diferite (ar fi tăiat exact cazul principal de folosire). Cine stă AFK un meci întreg nu primește
loc în clasament (rezultatul rămâne pe podium).

**Test:** un meci cu un om activ + unul nemișcat nu se salvează; cu doi activi, da; „Ştefan” și „Ștefan” sunt
același rând; a 21-a salvare de pe același IP într-o zi nu intră.

---

## D2 (mediu): ghicirea codurilor de cameră

**Unde:** `GET /rooms/:code` (`server/src/app.ts:13`) răspunde `open|full|playing|missing` fără limită;
`joinById` e și el un oracol.

**Calcul:** alfabet 31, 6 caractere → 31⁶ ≈ 887 milioane de coduri. Cu 20 de camere vii, o încercare nimerește
cu probabilitatea ~2,3·10⁻⁸; la 1000 cereri/s (ușor de pe un VPS) prima cameră găsită vine în ~12 ore în medie,
iar camerele în lobby sunt de obicei deschise câteva minute. Fezabil pentru cineva încăpățânat, nu pentru
trecători. **După M1** asta devine singura cale de a intra fără cod.

**Reparație propusă:** limitele din M2 pe `/rooms/:code` (20/min) și pe `joinById` (în `onAuth`): după 10 coduri
inexistente într-un minut de la un IP, 429 pentru 5 minute. Cu 10 încercări/min, timpul mediu ajunge la
~8 000 de ani per IP. Lungimea codului rămâne 6 (ușor de dictat la telefon).

**Impact:** cine greșește codul de 10 ori într-un minut așteaptă 5 minute; un grup pe același Wi-Fi care
greșește în paralel împarte bucket-ul (10 greșeli e mult pentru 6 oameni).

**Test:** al 11-lea cod greșit din același IP într-un minut primește 429; codul corect merge din alt IP.

---

## D3 (mediu): header-e de securitate lipsă în Caddy

**Unde:** `deploy/Caddyfile` nu setează niciun header de securitate. Caddy implicit nu trimite HSTS.

**Exploatare:**
- fără `frame-ancestors`/`X-Frame-Options`: jocul poate fi pus într-un iframe pe alt site (clickjacking pe
  „Creează joc”/„Ieși”, impact mic, dar și furt de trafic);
- fără HSTS: primul acces pe `http://` poate fi deturnat pe o rețea Wi-Fi ostilă (Caddy redirecționează, dar
  doar după prima cerere în clar);
- fără CSP: azi nu există XSS (vezi „Ce e în regulă”), dar CSP ar fi a doua plasă dacă apare unul;
- fără `nosniff`: risc mic (servim doar fișierele noastre).

**Reparație propusă (de aplicat de tine pe VPS, după acordul tău; o arăt exact în faza 2):** în blocul
`masinute-balci.duckdns.org`:

```caddy
header {
	Strict-Transport-Security "max-age=31536000"
	X-Content-Type-Options "nosniff"
	Referrer-Policy "strict-origin-when-cross-origin"
	X-Frame-Options "DENY"
	Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
	Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' wss://masinute-balci.duckdns.org; font-src 'self'; manifest-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
	-Server
}
```

CSP întâi în `Report-Only` (verificat local cu `vite preview` + aceleași header-e, apoi câteva zile pe site),
apoi trecut la `Content-Security-Policy`. `'unsafe-inline'` doar pentru stiluri (blocul `<style>` din
`index.html`; se poate înlocui cu un hash). `data:`/`blob:` la imagini: texturile Phaser și avatarele din lobby
sunt desenate în canvas și convertite în URL-uri `data:`. HSTS fără `includeSubDomains`/`preload` (domeniu
duckdns, nu al nostru). Nu ating blocurile Bombe și tren.

---

## D4 (mediu): lobby-uri care nu mor niciodată

**Unde:** `MasinuteRoom` (`autoDispose = true`: camera trăiește cât timp are un client).

**Exploatare:** 20 de WebSocket-uri (unul per cameră) stau conectate în lobby fără să facă nimic: serverul e
plin până se opresc. Heartbeat-ul ws (ping la 3 s) le ține vii cât timp scriptul răspunde.

**Reparație propusă:** un lobby fără Start în `LOBBY_IDLE_MINUTES` (ex. 20 min) se închide, cu un mesaj
(„Jocul a fost închis după 20 de minute fără start”). La fel o cameră în care niciun om conectat nu a trimis
nimic de X minute în timpul jocului (dar aici atenție: tab ascuns trimite input neutru, deci contorul e pe
conexiune, nu pe input).

**Impact:** un grup care stă în lobby peste 20 de minute (așteptând pe cineva) e trimis în meniu; valoarea e în
config.

**Test:** cu timpul simulat (clock-ul camerei), lobby-ul se închide după limită, nu înainte.

---

## m1 (mic): `Math.random` pentru coduri

**Unde:** `MasinuteRoom.ts:70-71` (`generateRoomCode(Math.random, ...)`, seed-ul camerei tot din
`Math.random`).

**Exploatare:** `Math.random` din V8 (xorshift128+) nu e criptografic; din destule ieșiri (codurile camerelor pe
care le creezi tu) starea se poate reconstitui cu un solver SMT și codurile următoare se pot prezice. Sofisticat;
după M1 + D2 ar fi singura scurtătură spre jocurile altora.

**Reparație:** `crypto.randomInt(0, 31)` pentru cod (funcția din `shared/roomCode.ts` primește deja generatorul
ca parametru) și `crypto.randomBytes` pentru seed. Simularea rămâne deterministă (seed-ul doar o pornește).

**Test:** `sourceRules`/test de server: `MasinuteRoom` nu mai folosește `Math.random`.

---

## m2 (mic): porecle

**Ce e deja bine:** `sanitizeName` (`shared/src/match.ts:60`) scoate `\p{Cc}` (control) și `\p{Cf}` (inclusiv
RTL override U+202E, zero-width), taie la 16 code points, gol → „Jucător”. Ca text nu poate injecta nimic (vezi
XSS mai jos).

**Ce trece:**
- zalgo: până la 15 semne combinante pe o literă (16 code points în total) → text care „curge” peste rândurile
  vecine în lobby/podium;
- caractere goale care nu sunt `Cf`: U+3164 (Hangul filler), U+115F, U+2800 (Braille gol) → nume invizibil;
- U+2028/U+2029 (separator de linie/paragraf, categoria `Z`) → rupe rândul;
- nume identic cu al altui jucător, cu al unui bot („Căluțul”), sau „Gazda”/„X (tu)” (eticheta de gazdă vine
  din `hostId`, deci nu se poate fura rolul, doar crea confuzie).

**Reparație:** NFC; scoatem `\p{Zl}\p{Zp}` și spațiile ne-standard (le facem spațiu normal, comprimăm); maxim
2 semne combinante după o literă; listă scurtă de caractere „goale” scoase; nume care rămâne fără nicio literă
sau cifră → „Jucător”; la `addPlayer`, un nume deja luat în cameră primește sufix („Silviu 2”). Rămâne în
`shared` ca să valideze la fel clientul (ecranul de nume) și serverul.

---

## m3 (mic): `/health` public

**Unde:** `server/src/app.ts:9`, accesibil ca `https://masinute-balci.duckdns.org/colyseus/health`.

**Ce scurge:** `{ ok, rooms, maxRooms, uptime }`. Un atacator vede exact când serverul e plin (feedback pentru
C1) și când a repornit. Fără versiuni, căi sau date personale.

**Reparație:** Caddy răspunde `404` la `/colyseus/health` din afară (`respond` într-un `handle` înaintea
`handle_path`). Health check-ul de deploy folosește deja `http://127.0.0.1:2568/health` direct
(`deploy/remote-update.sh:23`, `setup.sh:133`), deci nu se strică.

---

## m4 (mic): poreclă de 1 MB la join

**Unde:** `MasinuteRoom.onJoin` primește `options.name` de orice lungime; corpul HTTP de matchmake are limita
Colyseus de 1 MB (`router/node.mjs:6`). Verificat local: un nume de 200 000 de caractere e acceptat și tăiat.

**Impact:** regex + spread pe 1 MB pentru fiecare cerere: câteva ms de CPU, multiplicabil cu floodul din M2.

**Reparație:** `name.slice(0, 64)` înainte de `sanitizeName` (în `sanitizeName` însuși); `onAuth` refuză opțiuni
care nu sunt un obiect mic.

---

## m5 (mic): hardening systemd suplimentar

**Unde:** `deploy/masinute.service`. Ce e deja (bine): `NoNewPrivileges`, `ProtectSystem=strict`,
`ProtectHome`, `PrivateTmp`, `PrivateDevices`, `ProtectKernel*`, `ProtectControlGroups`,
`RestrictAddressFamilies`, `LockPersonality`, utilizator dedicat, `MemoryMax=250M`, cod deținut de root
(serviciul nu își poate rescrie bundle-ul).

**Propunere (de aplicat cu `setup.sh`, după acordul tău):**

```ini
IPAddressDeny=any
IPAddressAllow=localhost
CapabilityBoundingSet=
AmbientCapabilities=
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources
UMask=0077
```

`IPAddressDeny=any` + `localhost`: serverul nu are nevoie să iasă în internet; dacă vreodată ar fi compromis, nu
poate trimite date afară și nici ataca alte mașini (Caddy vine de pe 127.0.0.1, deci merge). **Nu**
`MemoryDenyWriteExecute` (JIT-ul V8 are nevoie de memorie W+X). Verificare după aplicare:
`systemd-analyze security masinute`.

---

## i1 (info): Caddy și VPS-ul comun

- Caddy nu are `log` pentru site: după un incident nu există urme. Propunere: `log { output file
  /var/log/caddy/masinute.log { roll_size 10mb roll_keep 3 } }` (spațiu mic, rotit).
- Limitele propuse sunt în Node; un flood de conexiuni TLS ajunge totuși la Caddy, comun cu Bombe și trenul.
  Caddy din apt nu are rate limiting. Dacă se întâmplă vreodată un atac real: `nftables` cu `ct count` per IP
  pe portul 443 (afectează toate site-urile, deci doar cu acordul tău și cu valori largi). Nu propun acum.

---

## Ce e deja în regulă (nu de atins)

**XSS (stored/reflected): nu am găsit niciunul.**
- Toate ecranele HTML construiesc nodurile cu `el()` (`client/src/ui/dom.ts`), care pune textul prin
  `textContent`; `setText` la fel. Poreclele din lobby, toast-uri (`presence.ts` → `Toasts`), dialoguri și
  **clasament** (`LeaderboardScene.ts:73`: `el('td', { text: e.name })`) sunt text, nu HTML. Clasamentul nu e
  XSS persistent.
- Podiumul, HUD-ul, etichetele de pe mașini sunt texte Phaser desenate în canvas: nu există DOM de injectat.
- Singurele `innerHTML`: iconițele SVG din `ui/chrome.ts:23` și indiciul de instalare din `ui/installHint.ts:16`,
  ambele cu constante din cod, fără date externe.
- Avatarele din lobby: `src` e un URL `data:` generat local din textura mașinii, nu din date de la server.
- Parametrii URL: `?room=` trece prin `normalizeRoomCode` + `isValidRoomCode` (alfabet fix, 6 caractere,
  `main.ts:54-57`), altfel „Codul din link nu e valid.”; `?lag`/`?jitter` sunt numere tăiate la 0–2000;
  `?bots`/`?rounds`/`?botlevel` sunt validate; `?seed` e doar pentru meciul local (hash, nu ajunge în DOM). URL-ul
  serverului vine din `VITE_SERVER_URL` la build, nu din pagină. Nu există `eval`/`new Function`.

**Input malițios și trișat:**
- `parseInput` (`shared/src/netcode.ts`): obiect obligatoriu; `seq` întreg 1..2³²−1; `steer`/`throttle` doar
  numere; `boost` doar `=== true`. Apoi `axis()` (`sim.ts:46`) cere `Number.isFinite` (NaN/Infinity → 0, chiar
  dacă msgpack le poate transporta), trunchiază și strânge la −100..100. String/obiect/uriaș → ignorat.
- `seq` sărit înainte (ex. 4 294 967 295): jucătorul își blochează doar propriile input-uri (toate cele următoare
  par vechi); nu afectează pe nimeni altcineva. Repetat/vechi → ignorat.
- Viteza, boost-ul, cooldown-ul, coliziunile, scorul, power-up-urile: calculate doar pe server; clientul trimite
  doar intenția. Nu există speed hack sau teleport.
- Id-ul jucătorului vine din conexiune (`client.sessionId`), niciodată din mesaj. Acțiunile de gazdă
  (`rounds`, `addBot`, `removeBot`, `botLevel`, `setBotLevel`, `powerups`, `start`, `lobby`) sunt verificate
  `byId === state.hostId` în funcțiile din `shared/match.ts`; `skipRound` verifică gazda în cameră. Gazda trece
  doar la un om (`nextHost`). Nu se poate impersona gazda.
- Tipuri de mesaje necunoscute: ignorate (`onMessage('*')`). `botId: "__proto__"` nu face nimic (`?.isBot` e
  `undefined`). `ping` răspunde doar la un număr finit și intră în limita de 60 mesaje/s.
- Ce nu se poate repara: un client scriptat poate juca „perfect” (vede toată starea, ca orice joc cu
  informație completă). Nu există informație ascunsă de furat.

**Rețea și Colyseus:** `maxPayload` 4 KB, `perMessageDeflate` oprit, `maxMessagesPerSecond = 60`, coadă de input
mărginită (4), socket fără rezervare închis după 1 s, ping/heartbeat care închide clienții morți, `sessionId` și
token-ul de reconectare generate cu `nanoid` (criptografic), token-ul ținut doar în `sessionStorage`-ul tab-ului,
reconectare de 15 s.

**SQLite:** interogări parametrizate peste tot; `node:sqlite` fără dependențe native; erorile DB doar logate;
DB-ul în `StateDirectory` (`/var/lib/masinute`, 0750), în afara release-urilor; backup zilnic cu
`integrity_check`; un meci intră doar cu ≥ 2 oameni, iar jocurile offline nu ajung la server.

**Infrastructură:** server pe `127.0.0.1:2568` (loopback, implicit în `config.ts` și forțat în unit);
TLS automat de la Caddy; release-uri despachetate cu `--no-same-owner`, deținute de root (`chmod go=rX`);
`ssh -n` + `BatchMode`; health check pe loopback cu rollback automat; `npm audit`: **0 vulnerabilități** (și cu
`--omit=dev`); niciun secret în repo sau în istoricul git (căutat: parole, chei, token-uri, `.env`, `.pem`,
`.db`; IP-ul din `push.ps1`/README e `203.0.113.10`, adresă de documentație); `.env*` și `data/` sunt în
`.gitignore`; sourcemap-urile serverului rămân pe server (Caddy servește doar `client/`).

---

## Bombe și Petarde: de verificat într-un audit separat

Citit doar (fără modificări), după aceeași arhitectură: `server/src/BombeRoom.ts:63` folosește tot
`generateRoomCode(Math.random, ...)` și camerele nu apelează `setPrivate`, deci **probabil are aceleași
probleme**: M1 (intrare fără cod prin `/matchmake/join`), C1 (`MAX_ROOMS` global fără limită per IP), M2
(fără limite per IP, CORS deschis, fără Origin), M3 (`context.ip` falsificabil prin `X-Real-IP`), D2/m1
(coduri ghicibile/predictibile), D3 (blocul lui din Caddyfile, probabil fără header-e), D4, m3 (`/health`),
plus clasamentul lui (același design: D1). De confirmat acolo cu teste locale, pe alt port.

---

## Faza 2: cum lucrez (după aprobarea listei)

- Fiecare reparație cu un test care arată atacul reușind înainte și blocat după (testele de cameră pe portul
  2569, ca acum; nimic pe VPS).
- Limitele în `server/src/config.ts`, suprascrise din env; valorile de mai sus ca implicite.
- Fără dependențe noi native, fără plugin-uri Caddy.
- Cod: deploy cu `push.ps1` (întâi `-WhatIf`). Caddy (D3, M3 partea 1, m3, i1) și systemd (m5): pregătite în
  `deploy/`, cu comenzile exacte arătate ție, aplicate doar după acordul tău.
- **Atenție la ordinea deploy-ului:** partea de server din M3 se bazează pe `X-Real-IP` pus de Caddy. Dacă
  serverul nou ajunge înaintea schimbării de Caddy, toți jucătorii par să vină de la același IP („necunoscut”) și
  limitele per IP i-ar strânge pe toți la un loc. Deci: întâi Caddy (cu acordul tău), apoi `push.ps1`; sau
  limitele per IP pornite printr-un flag de config abia după.
