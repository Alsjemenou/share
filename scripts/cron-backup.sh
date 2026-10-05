#!/bin/sh
# Dagelijkse automatische DB-back-up van Deel naar de SMB-share.
# De API-route beslist zelf of de automatische back-up aanstaat (auto_enabled) en,
# bij 'wekelijks', of het vandaag de gekozen weekdag is. Dit script roept 'm alleen aan.
#
# Installeren (als root op de server):
#   chmod +x /opt/share/scripts/cron-backup.sh
#   (crontab -l 2>/dev/null; echo '30 3 * * * /opt/share/scripts/cron-backup.sh >> /var/log/deel-backup.log 2>&1') | crontab -
set -e
cd "$(dirname "$0")/.."
SECRET=$(grep -E '^CRON_SECRET=' data/storage.env 2>/dev/null | cut -d= -f2-)
[ -z "$SECRET" ] && { echo "$(date -Is) geen CRON_SECRET in data/storage.env — overgeslagen"; exit 0; }
echo "$(date -Is) start auto-backup"
curl -fsS "http://localhost:3005/api/backup/smb?cron=1&secret=$SECRET" && echo "" || echo "$(date -Is) backup-aanroep mislukt"
