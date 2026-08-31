#!/usr/bin/env bash
#
# Deel — bijwerken naar de nieuwste versie.
# Draai:   bash /opt/share/scripts/update.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/share}"
blauw() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
groen() { printf '\033[1;32m%s\033[0m\n' "$1"; }

cd "${APP_DIR}"

blauw "Nieuwe code ophalen"
# Op Linux herschrijft npm de package-lock.json met platform-specifieke entries;
# gooi die wijziging weg zodat 'git pull' niet blokkeert.
git checkout -- package-lock.json 2>/dev/null || true
git pull

blauw "Dependencies bijwerken en opnieuw bouwen"
npm install
npm run build

blauw "App herstarten"
pm2 restart share
pm2 save

groen "Klaar! Data en bestanden zijn behouden (data/, data/bestanden/)."
