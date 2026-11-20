# Deploy pe VPS-ul Oracle

Jocul rulează la **https://masinute-balci.duckdns.org**, pe VPS-ul Oracle (Ubuntu, 1 GB RAM, user `ubuntu`,
alias SSH `oracle`), lângă jocul cu trenul și Bombe și Petarde. Scripturile ating doar ce ține de mașinuțe:

| Ce | Unde |
|---|---|
| user de sistem | `masinute` |
| versiunile | `/opt/masinute/releases/<data-ora>/` (`server/index.js` + `.map`, `client/`, `VERSION`) |
| versiunea activă / anterioară | symlink-urile `/opt/masinute/current` și `/opt/masinute/current.prev` |
| clientul servit de Caddy | `/var/www/masinute` → `/opt/masinute/current/client` |
| serviciul | `masinute.service` (Node pe `127.0.0.1:2568`, `MemoryMax=250M`, heap `--max-old-space-size=170`, `Restart=always`) |
| clasamentul | `/var/lib/masinute/leaderboard.db` (SQLite, WAL; `StateDirectory` al user-ului `masinute`) |
| backup-ul clasamentului | `masinute-backup.timer` zilnic (~04:45) → `/var/lib/masinute/backups/leaderboard-AAAALLZZ.db`, ultimele 7 |
| Caddy | blocul `masinute-balci.duckdns.org` din `/etc/caddy/Caddyfile` |

**Nu se ating**: `bombe` (port 2567, `/opt/bombe`, `/var/www/bombe`, `bombe-petarde.duckdns.org`),
`cabina-api` (`/var/www/cabina`, `tren-api.duckdns.org`). Caddy primește doar `reload`, niciodată restart.
Nu e nevoie de Docker, Redis sau module native: serverul e un singur fișier `index.js` (bundle esbuild).

Fișiere:

- `setup.sh`: instalarea inițială, pe VPS (o singură dată; poate fi rulat din nou fără efecte nedorite);
  pe server folderul `deploy/` stă în `/home/ubuntu/masinute-deploy` (copia de la ultima instalare);
- `push.ps1`: actualizare de pe Windows (teste, typecheck, build, upload, comutare atomică, health check, rollback);
- `remote-update.sh`: partea de pe server a lui `push.ps1` (o urcă și o rulează el);
- `masinute.service`, `Caddyfile`: unit-ul systemd și blocul Caddy, instalate de `setup.sh`;
- `masinute-backup.service`, `masinute-backup.timer`, `masinute-backup.sh`: backup-ul zilnic al clasamentului,
  instalate tot de `setup.sh` (scriptul ajunge în `/usr/local/sbin/masinute-backup`).

## Înainte de prima instalare

1. **DuckDNS**: creează subdomeniul `masinute-balci` și pune-l pe IP-ul public al VPS-ului.
   Verifică din PowerShell: `Resolve-DnsName masinute-balci.duckdns.org` (trebuie să dea IP-ul VPS-ului).
2. **Porturile** 80 și 443 sunt deja deschise (le folosesc celelalte site-uri). Portul 2568 **nu** se deschide:
   serverul ascultă doar pe loopback, Caddy e singura intrare.
3. **SSH**: `ssh oracle "echo ok"` merge din PowerShell fără parolă (alias în `~/.ssh/config`).
4. **Local**: `npm install`, apoi `.\deploy\push.ps1 -WhatIf` trece (teste, typecheck, build, arhivă;
   serverul nu e atins).

## Prima instalare

Din PowerShell, în rădăcina repo-ului:

```powershell
# 1. copiază folderul deploy/ pe server, în /home/ubuntu/masinute-deploy (rămâne acolo)
ssh oracle "rm -rf ~/masinute-deploy"
scp -r deploy oracle:masinute-deploy
# scp de pe Windows lasă folderul scriibil de oricine; setup.sh rulează cu sudo, deci doar ubuntu scrie aici
ssh oracle "chmod 755 ~/masinute-deploy && chmod 644 ~/masinute-deploy/*"

# 2. instalarea (user, directoare, systemd, backup, Caddy)
ssh -t oracle "sudo bash ~/masinute-deploy/setup.sh"

# 3. prima versiune: build, upload, pornește serviciul, health check
.\deploy\push.ps1

# 4. verificare
ssh oracle "systemctl status masinute --no-pager; cat /opt/masinute/current/VERSION"
Invoke-WebRequest https://masinute-balci.duckdns.org/colyseus/health -UseBasicParsing | Select-Object -Expand Content
```

`setup.sh`:

1. afișează memoria liberă și swap-ul (`free -h`, `swapon --show`); avertizează dacă nu există swap sau
   dacă sunt sub 300 MB disponibili (nu se oprește, nu creează swap);
2. verifică Node ≥ 22.12 în `/usr/bin/node`; dacă lipsește sau e mai vechi, îl instalează din NodeSource
   (pe acest VPS e deja instalat pentru bombe, deci de obicei nu face nimic);
3. verifică că portul 2568 e liber (sau deja al lui `masinute`);
4. creează user-ul `masinute`, `/opt/masinute/releases` și symlink-ul `/var/www/masinute`;
5. instalează și activează `masinute.service` (îl repornește doar dacă unit-ul s-a schimbat; înainte de
   primul `push.ps1` nu pornește, pentru că nu există încă nicio versiune);
6. instalează `sqlite3` (dacă lipsește) și backup-ul zilnic al clasamentului (`masinute-backup.timer`):
   `sqlite3 .backup`, deci o copie consistentă chiar dacă serverul scrie în acel moment, verificată cu
   `integrity_check`; se păstrează ultimele 7 zile;
7. dacă `/etc/caddy/Caddyfile` nu conține încă `masinute-balci.duckdns.org`: validează configurația existentă,
   face un backup cu dată și oră (`Caddyfile.bak-AAAALLZZ-HHMMSS`), adaugă blocul, validează din nou
   (dacă pică, restaurează backup-ul și se oprește fără reload), apoi `systemctl reload caddy`.
   Dacă blocul există deja, nu modifică nimic.

Primul health check public poate dura câteva secunde, cât Caddy ia certificatul HTTPS (`push.ps1` încearcă
de 10 ori). Dacă tot pică la primul deploy, nu există o versiune anterioară la care să revină: verifică DNS-ul
și `ssh oracle "journalctl -u caddy -n 50 --no-pager"`.

## Actualizări

```powershell
.\deploy\push.ps1            # deploy
.\deploy\push.ps1 -WhatIf    # testele, build-ul și arhiva local + comenzile care s-ar rula; serverul nu e atins
.\deploy\push.ps1 -Rollback  # revine la versiunea anterioară, fără build
```

Parametri: `-Server` (implicit `oracle`), `-User`, `-Key`, `-WhatIf`, `-Rollback`; fără alias:
`.\deploy\push.ps1 -Server 203.0.113.10 -Key C:\cale\cheie` (user implicit `ubuntu`).
`ssh` rulează cu `-n` (stdin închis; `scp` primește un stdin gol) și ambele cu `-o BatchMode=yes` (fără prompt
ascuns de parolă) plus timeout-uri de conexiune.

Ce face un deploy:

1. avertizează dacă ai modificări necomise (nu se oprește);
2. rulează local `npm test`, `npm run typecheck`, `npm run build` și se oprește la prima eroare;
3. pune `server/dist/index.js` (+ `.map`) și `client/dist/` (plus `VERSION`: commit și oră) într-un `release.tar.gz`;
4. îl copiază cu `scp`, împreună cu `remote-update.sh` (fără CRLF), în `/tmp/masinute-push`;
5. pe server: despachetează într-o versiune nouă, mută `current.prev` pe versiunea activă și comută
   `current` pe cea nouă printr-o singură redenumire de symlink (serverul și clientul se schimbă împreună),
   apoi repornește `masinute` și așteaptă `http://127.0.0.1:2568/health`;
6. de pe Windows verifică drumul public prin Caddy, `https://masinute-balci.duckdns.org/colyseus/leaderboard`
   (`/colyseus/health` răspunde 404 din afară: e doar pentru scripturile de pe VPS).

Dacă oricare health check pică, revine automat la versiunea anterioară: versiunea nouă e ștearsă și
`current.prev` rămâne cum era. Pe server se păstrează versiunea activă, cea anterioară și încă trei.

Un restart pierde room-urile în curs (jucătorii văd „Conexiunea cu serverul s-a pierdut”), deci actualizează
când nu se joacă nimeni. După o modificare a lui `masinute.service` sau a backup-ului, copiază din nou `deploy/`
(pașii 1 și 2 de la prima instalare) și rulează `setup.sh` (`push.ps1` nu instalează unit-uri și nu atinge
`~/masinute-deploy`, deci copia de acolo e cea de la ultimul `setup.sh`).

## Modificări ale blocului din Caddy

`setup.sh` adaugă blocul doar dacă lipsește. Pentru a-l schimba după prima instalare (header-e de securitate,
CSP etc.), `caddy-update.sh` înlocuiește doar blocul `masinute-balci.duckdns.org` din `/etc/caddy/Caddyfile`:
validează Caddyfile-ul de acum și pe cel nou înainte să scrie, face o copie `Caddyfile.bak-<data>`, dă
`systemctl reload caddy` (fără restart) și verifică Bombe, trenul și jocul; dacă ceva nu mai răspunde ca înainte,
pune copia înapoi.

```powershell
# 1. deploy/ actualizat pe server (ca la prima instalare), din rădăcina repo-ului
ssh oracle "rm -rf ~/masinute-deploy"
scp -r deploy oracle:masinute-deploy
ssh oracle "chmod 755 ~/masinute-deploy && chmod 644 ~/masinute-deploy/*"
# 2. diferența și validarea, fără să scrie nimic
ssh -t oracle "sudo bash ~/masinute-deploy/caddy-update.sh --dry-run"
# 3. aplicarea
ssh -t oracle "sudo bash ~/masinute-deploy/caddy-update.sh"
```

Revenire manuală: `sudo cp -a /etc/caddy/Caddyfile.bak-<data> /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
CSP-ul e întâi `Content-Security-Policy-Report-Only`: încălcările ajung în jurnalul serverului
(`ssh oracle "journalctl -u masinute --no-pager | grep CSP:"`). Când nu mai apar, numele header-ului din
`deploy/Caddyfile` devine `Content-Security-Policy` și se rulează din nou pașii de mai sus.

## Clasamentul

Serverul ține clasamentul all-time în `/var/lib/masinute/leaderboard.db` (`DB_PATH` din `masinute.service`).
Directorul e `StateDirectory=masinute`: îl creează systemd, aparține user-ului `masinute` și e singurul loc în
care serviciul poate scrie (`ProtectSystem=strict` rămâne). Deploy-ul și rollback-ul lucrează doar în
`/opt/masinute`, deci baza nu e atinsă niciodată. Schema se actualizează singură la pornire (migrații).
Dacă baza nu poate fi deschisă, serverul pornește fără clasament (eroarea apare în `journalctl`) și jocul merge.

```powershell
ssh oracle "sudo systemctl start masinute-backup && sudo ls -la /var/lib/masinute/backups"   # backup manual
ssh oracle "systemctl list-timers masinute-backup --no-pager"                                # următorul backup
ssh oracle "curl -s http://127.0.0.1:2568/leaderboard"                                       # topul, ca JSON
```

Restaurare: `sudo systemctl stop masinute`, copiază backup-ul peste `/var/lib/masinute/leaderboard.db`
(șterge `leaderboard.db-wal` și `leaderboard.db-shm`, păstrează owner-ul `masinute:masinute`),
`sudo systemctl start masinute`.

## Util

```powershell
ssh oracle "journalctl -u masinute -n 50 --no-pager"       # loguri
ssh oracle "cat /opt/masinute/current/VERSION"             # ce versiune rulează
ssh oracle "curl -s http://127.0.0.1:2568/health"          # camere active / maxim
ssh oracle "systemctl show masinute -p MemoryCurrent"      # memoria folosită (limita: 250M)
ssh oracle "free -h; swapon --show"
```
