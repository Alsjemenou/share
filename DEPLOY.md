# 🚀 Deel — Installatiehandleiding

Deze app draait op **dezelfde host** als finance, boekhouding en sport, maar op een **eigen interne
poort (3003)** en met een eigen adres: **share.local / 192.168.2.42**. Ze delen niets — eigen
database, eigen Nginx-site.

---

## Wat heb je nodig?

- De server waarop de andere apps al draaien (Debian 12/13 of Ubuntu 22.04+), met **root/sudo**.
- Internet tijdens de installatie.
- Ongeveer **10 minuten**.
- Voldoende **schijfruimte** voor de bestanden die je gaat delen (dit is je NAS-vervanger!).

> Finance = 3000, Boekhouding = 3001, Sport = 3002, Deel = 3003 — ze bijten elkaar dus niet.

---

## A. Snelle installatie (aanbevolen)

```bash
curl -fsSL https://raw.githubusercontent.com/Alsjemenou/share/main/scripts/install.sh -o install.sh
sudo bash install.sh
```

Het script stelt een paar korte vragen (standaardwaarde tussen `[ ]` — Enter = die gebruiken):

```
Hostnaam/IP waarop de site draait [share.local 192.168.2.42]:
Installatiemap [/opt/share]:
Nginx installeren (adres zonder :3003) (yes/no) [yes]:
Doorgaan met installeren? (yes/no) [yes]:
```

Daarna: Node.js 20 + PM2 installeren, code ophalen naar `/opt/share`, bouwen, starten en een
Nginx-site aanmaken zodat je de app op `http://share.local/` opent.

### DNS / hosts

Zorg dat **share.local** naar **192.168.2.42** wijst (A-record op je router/DNS, of in het
hosts-bestand). **Deze DNS-regel moet nog toegevoegd worden.**

### Instellingen vooraf meegeven (optioneel)

| Instelling | Betekenis | Standaard |
|---|---|---|
| `SERVER_NAME` | Hostnaam(en)/IP | `share.local 192.168.2.42` |
| `APP_DIR` | Installatiemap | `/opt/share` |
| `APP_PORT` | Interne poort | `3003` |
| `REPO_URL` | Git-adres | de standaard repo |
| `SETUP_NGINX` | Nginx installeren | `yes` |
| `MAX_BODY` | Max. grootte per upload-chunk (Nginx) | `100M` |

---

## B. Handmatige installatie

```bash
git clone https://github.com/Alsjemenou/share.git /opt/share
cd /opt/share
mkdir -p data data/bestanden data/uploads-tmp
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
```

Nginx-site (poort 80 → 3003) — **let op: geen statische bestandslocatie**, bestanden zijn privé.
`proxy_request_buffering off` + ruime timeouts zijn belangrijk voor grote uploads:

```nginx
server {
    listen 80;
    server_name share.local 192.168.2.42;
    client_max_body_size 100M;      # uploads gaan in stukken; dit hoeft niet groot te zijn

    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/share /etc/nginx/sites-enabled/share
nginx -t && systemctl reload nginx
```

> **Grote bestanden (10 GB+)?** Uploads worden client-side in stukken van 8 MB geknipt en hervatten
> automatisch, dus Nginx ziet alleen kleine requests. `client_max_body_size` hoeft daarom niet op
> de bestandsgrootte gezet te worden — 100M is ruim voldoende.

---

## Eerste gebruik

Open `http://share.local/`. Bij het eerste bezoek maak je het **beheerdersaccount** aan (deze ziet
alles). Voeg daarna bij **Beheer → Personen** eventueel vaste personen toe, of deel gewoon een
bestand met een e-mailadres — dan ontstaat automatisch een uitgenodigd account met een invite-link.

## 🔄 Bijwerken

```bash
bash /opt/share/scripts/update.sh
```

## 💾 Data & back-up

- Database: `data/share.db` (accounts, bestand-metadata, deel-links, download-log)
- Bestanden: `data/bestanden/` (privé — de eigenlijke uploads; **dit is je NAS-data**)
- Lopende uploads: `data/uploads-tmp/`
- Sessiegeheim: `data/.session-secret`

Alles onder `data/` staat buiten versiebeheer. De **ingebouwde back-up** (Beheer → Back-up) bevat
alléén de database — niet de bestanden, want die kunnen tientallen GB's zijn. Neem de map
`data/bestanden/` mee in je **reguliere (versleutelde) back-up** van de server.

## 🛠️ Handige commando's

| Wat | Commando |
|---|---|
| Status | `pm2 status` |
| Logs | `pm2 logs share` |
| Herstarten | `pm2 restart share` |
| Bijwerken | `bash /opt/share/scripts/update.sh` |
