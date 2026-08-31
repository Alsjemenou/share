#!/usr/bin/env bash
#
# Deel — installatie op een server (Debian 12/13 of Ubuntu 22.04+).
# Draai dit script als root:   sudo bash install.sh
#
# Draait naast finance (3000), boekhouding (3001) en sport (3002) op DEZELFDE host:
# interne poort 3003. Je kunt instellingen vooraf meegeven, bijvoorbeeld:
#   SERVER_NAME="share.local 192.168.2.42" sudo -E bash install.sh
#
set -euo pipefail

_SERVER_NAME_SET="${SERVER_NAME+x}"
_APP_DIR_SET="${APP_DIR+x}"
_NGINX_SET="${SETUP_NGINX+x}"

REPO_URL="${REPO_URL:-https://github.com/Alsjemenou/share.git}"
APP_DIR="${APP_DIR:-/opt/share}"
APP_PORT="${APP_PORT:-3003}"
SERVER_NAME="${SERVER_NAME:-share.local 192.168.2.42}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SETUP_NGINX="${SETUP_NGINX:-yes}"
# Max. grootte van één upload-chunk die Nginx doorlaat (uploads gaan in stukken).
MAX_BODY="${MAX_BODY:-100M}"

blauw() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
groen() { printf '\033[1;32m%s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Draai dit script als root:  sudo bash install.sh" >&2
  exit 1
fi

vraag() {
  local antwoord
  read -r -p "$1 [$2]: " antwoord </dev/tty || true
  printf '%s' "${antwoord:-$2}"
}
jaNee() {
  local a; a="$(vraag "$1 (yes/no)" "$2")"
  case "$a" in y|Y|yes|Yes|ja|Ja) echo yes;; *) echo no;; esac
}

if [ -t 0 ] || [ -e /dev/tty ]; then
  echo ""
  echo "──────────────────────────────────────────────"
  echo " Deel — installatie (bestanden delen)"
  echo " Druk op Enter om de [standaardwaarde] te gebruiken."
  echo "──────────────────────────────────────────────"
  [ -z "${_SERVER_NAME_SET}" ] && SERVER_NAME="$(vraag "Hostnaam/IP waarop de site draait" "${SERVER_NAME}")"
  [ -z "${_APP_DIR_SET}" ]     && APP_DIR="$(vraag "Installatiemap" "${APP_DIR}")"
  [ -z "${_NGINX_SET}" ]       && SETUP_NGINX="$(jaNee "Nginx installeren (adres zonder :${APP_PORT})" "${SETUP_NGINX}")"
  echo ""
  echo " Samenvatting:"
  echo "   Map            : ${APP_DIR}"
  echo "   Adres (nginx)  : ${SERVER_NAME}"
  echo "   Interne poort  : ${APP_PORT}"
  echo "   Nginx          : ${SETUP_NGINX}"
  if [ "$(jaNee "Doorgaan met installeren?" "yes")" != "yes" ]; then
    echo "Geannuleerd."; exit 0
  fi
fi

blauw "1/6  Systeem bijwerken en basispakketten installeren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates build-essential python3

blauw "2/6  Node.js ${NODE_MAJOR} installeren (indien nodig)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
groen "Node: $(node -v)   npm: $(npm -v)"

blauw "3/6  PM2 installeren (procesbeheer)"
npm install -g pm2

blauw "4/6  Broncode ophalen naar ${APP_DIR}"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" pull
else
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
fi
cd "${APP_DIR}"
mkdir -p data data/bestanden data/uploads-tmp

blauw "5/6  Dependencies installeren en applicatie bouwen"
npm install
npm run build

blauw "6/6  App starten met PM2 (naam: share) + automatisch opstarten bij reboot"
pm2 delete share >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | grep -E '^sudo ' | bash || true
pm2 save

if [ "${SETUP_NGINX}" = "yes" ]; then
  blauw "Extra  Nginx reverse proxy instellen (poort 80 → ${APP_PORT})"
  apt-get install -y nginx
  # LET OP: geen statische bestandslocatie. Bestanden staan privé in data/bestanden/
  # en gaan uitsluitend via de app (login/eigenaarschap of een geldige deel-link).
  # proxy_request_buffering off: chunks worden direct doorgezet i.p.v. eerst op schijf
  # van Nginx gebufferd — fijn voor grote uploads.
  cat > /etc/nginx/sites-available/share <<NGINX
server {
    listen 80;
    server_name ${SERVER_NAME};
    client_max_body_size ${MAX_BODY};

    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/share /etc/nginx/sites-enabled/share
  nginx -t && systemctl reload nginx
else
  blauw "Nginx overgeslagen (SETUP_NGINX=no) — app draait op poort ${APP_PORT}"
fi

groen ""
groen "════════════════════════════════════════════════════════════"
groen " Installatie klaar!"
groen "  • Open in de browser:   http://share.local/  (of http://192.168.2.42/)"
groen "  • Eerste bezoek:        maak het beheerdersaccount aan"
groen "  • App-map:              ${APP_DIR}"
groen "  • Status bekijken:      pm2 status"
groen "  • Logs bekijken:        pm2 logs share"
groen "  • Bijwerken:            bash ${APP_DIR}/scripts/update.sh"
groen "════════════════════════════════════════════════════════════"
