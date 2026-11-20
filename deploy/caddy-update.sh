#!/usr/bin/env bash
# Înlocuiește blocul masinute-balci.duckdns.org din /etc/caddy/Caddyfile cu cel din deploy/Caddyfile
# (header-e de securitate, X-Real-IP, /health ascuns). Celelalte site-uri (Bombe, trenul) nu sunt atinse.
#
#   sudo bash ~/masinute-deploy/caddy-update.sh --dry-run   # arată diferența și validează, nu scrie nimic
#   sudo bash ~/masinute-deploy/caddy-update.sh             # copie, validare, reload, verificare
#
# Pași: validează Caddyfile-ul de acum; notează ce răspund cele trei site-uri; face o copie
# (Caddyfile.bak-<data>); construiește noul Caddyfile într-un fișier temporar și îl validează; abia apoi îl
# scrie și face `systemctl reload caddy` (fără restart: nicio întrerupere). Dacă reload-ul eșuează sau
# Bombe/trenul nu mai răspund ca înainte, pune copia înapoi și reîncarcă.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE=/etc/caddy/Caddyfile
DOMAIN=masinute-balci.duckdns.org
OTHERS=(bombe-petarde.duckdns.org tren-api.duckdns.org)
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

say() { printf '\n== %s\n' "$*"; }
die() { printf 'EROARE: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Rulează cu sudo: sudo bash $0 ${1:-}"
command -v caddy >/dev/null || die "Caddy nu e instalat."
[ -f "$CADDYFILE" ] || die "Nu găsesc $CADDYFILE."
[ -f "$HERE/Caddyfile" ] || die "Nu găsesc $HERE/Caddyfile."

# Validează cu variabilele de mediu ale serviciului caddy (alte site-uri pot folosi {$VAR}), ca setup.sh.
validate_caddy() (
  set -a
  for f in $(systemctl show caddy --property=EnvironmentFiles --value | grep -o '/[^ ]*' || true); do
    if [ -r "$f" ]; then . "$f"; fi
  done
  set +a
  # shellcheck disable=SC2046
  env $(systemctl show caddy --property=Environment --value) caddy validate --config "$1" --adapter caddyfile
)

# Codul HTTP al unui site, cerut local (prin Caddy de pe 127.0.0.1, cu SNI-ul domeniului); 000 = nu răspunde.
status() { curl -sS -o /dev/null -m 10 --resolve "$1:443:127.0.0.1" -w '%{http_code}' "https://$1${2:-/}" 2>/dev/null || echo 000; }

say "1. Caddyfile-ul de acum"
validate_caddy "$CADDYFILE" >/dev/null 2>&1 || die "Caddyfile-ul existent nu trece validarea; nu îl modific. Verifică: sudo caddy validate --config $CADDYFILE"
n=$(grep -c "^$DOMAIN {" "$CADDYFILE" || true)
[ "$n" = 1 ] || die "Mă așteptam la exact un rând '$DOMAIN {' la început de linie în $CADDYFILE (am găsit $n)."
echo "valid; blocul $DOMAIN găsit"

say "2. Cum răspund site-urile acum"
declare -A BEFORE
for d in "${OTHERS[@]}" "$DOMAIN"; do
  BEFORE[$d]=$(status "$d")
  echo "$d: ${BEFORE[$d]}"
done

say "3. Noul Caddyfile (temporar) și validarea lui"
block=$(mktemp)
candidate=$(mktemp)
trap 'rm -f "$block" "$candidate"' EXIT
# Doar blocul site-ului din deploy/Caddyfile (fără comentariile de deasupra), fără CRLF.
tr -d '\r' < "$HERE/Caddyfile" | awk -v start="$DOMAIN {" 'index($0, start) == 1 { on = 1 } on { print } on && /^}/ { exit }' > "$block"
grep -q "^}" "$block" || die "Blocul din $HERE/Caddyfile nu se termină cu '}' la început de linie."
# Blocul vechi (de la '$DOMAIN {' până la primul '}' de la început de linie) e înlocuit cu cel nou.
awk -v start="$DOMAIN {" -v blockfile="$block" '
  !skip && index($0, start) == 1 { while ((getline line < blockfile) > 0) print line; skip = 1; next }
  skip { if ($0 ~ /^}/) skip = 0; next }
  { print }
' "$CADDYFILE" > "$candidate"
diff -u "$CADDYFILE" "$candidate" && { echo "Nicio diferență: blocul e deja la zi."; exit 0; } || true
validate_caddy "$candidate" || die "Noul Caddyfile nu trece validarea; nu am schimbat nimic."
echo "noul Caddyfile e valid"
if [ "$DRY_RUN" = 1 ]; then
  echo
  echo "--dry-run: nu am scris nimic. Pentru aplicare: sudo bash $0"
  exit 0
fi

say "4. Copie, scriere, reload"
backup="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CADDYFILE" "$backup"
echo "copie: $backup"
restore() {
  echo "Pun înapoi copia $backup și reîncarc Caddy." >&2
  cat "$backup" > "$CADDYFILE"
  systemctl reload caddy || true
}
cat "$candidate" > "$CADDYFILE" # păstrează proprietarul și drepturile fișierului
validate_caddy "$CADDYFILE" >/dev/null 2>&1 || { restore; die "Validarea după scriere a eșuat."; }
systemctl reload caddy || { restore; die "systemctl reload caddy a eșuat (vezi journalctl -u caddy -n 30)."; }
echo "Caddy reîncărcat"
sleep 2

say "5. Verificare"
failed=0
for d in "${OTHERS[@]}" "$DOMAIN"; do
  now=$(status "$d")
  echo "$d: înainte ${BEFORE[$d]}, acum $now"
  # Un site care răspundea (sub 500) și acum nu mai răspunde sau dă 5xx = problemă.
  if [ "${BEFORE[$d]}" != 000 ] && [ "${BEFORE[$d]}" -lt 500 ] && { [ "$now" = 000 ] || [ "$now" -ge 500 ]; }; then failed=1; fi
done
headers=$(curl -sS -m 10 --resolve "$DOMAIN:443:127.0.0.1" -D - -o /dev/null "https://$DOMAIN/" || true)
for h in Strict-Transport-Security X-Content-Type-Options Referrer-Policy X-Frame-Options Content-Security-Policy-Report-Only; do
  if printf '%s' "$headers" | grep -qi "^$h:"; then echo "header $h: da"; else echo "header $h: LIPSEȘTE"; failed=1; fi
done
echo "/colyseus/health din afară: $(status "$DOMAIN" /colyseus/health) (așteptat 404)"
echo "/colyseus/leaderboard: $(status "$DOMAIN" /colyseus/leaderboard) (așteptat 200)"
[ "$(status "$DOMAIN" /colyseus/health)" = 404 ] || failed=1
[ "$(status "$DOMAIN" /colyseus/leaderboard)" = 200 ] || failed=1
if [ "$failed" = 1 ]; then
  restore
  die "Verificarea a eșuat; am revenit la copia de dinainte."
fi
echo
echo "Gata. Copia veche rămâne în $backup."
