# 📤 Deel

Je eigen **NAS- & WeTransfer-vervanging**: upload bestanden en deel ze veilig — zonder je NAS aan
het internet bloot te stellen. Draait intern op je eigen server.

Zusje van `financieel-dashboard`, `boekhouding` en `sport`. Zelfde stack: **Next.js 16, React 19,
better-sqlite3 (WAL), Tailwind v4, PM2 + Nginx**.

## Wat kan het?

- **Uploaden** van (grote) bestanden — in stukken en **hervatbaar**, dus 10 GB+ is geen probleem.
- **Delen via publieke link** (WeTransfer-stijl) met optioneel **wachtwoord**, **verloopdatum** en
  **downloadlimiet**; downloads worden **geteld en gelogd**.
- **Delen naar een account**: de ontvanger logt in en ziet alleen wat met hem/haar gedeeld is.
  Nog geen account? Dan komt er automatisch een **uitnodigingslink** die je zelf doorstuurt.
- **Beheerder** ("super") ziet alle bestanden en beheert personen.

## Adres & poort

- Intern: **poort 3005**
- Adres: **share.local / 192.168.2.42**

## Lokaal draaien (ontwikkeling)

```bash
npm install
npm run dev
```

Open <http://localhost:3005>. Bij het eerste bezoek maak je het beheerdersaccount aan.

## Installeren op de server

Zie [DEPLOY.md](DEPLOY.md).

## Structuur

- `app/(app)/` — afgeschermd deel (login vereist): Mijn bestanden, Gedeeld met mij, Beheer, Instellingen
- `app/(public)/` — publieke pagina's zonder login: `/d/<token>` (download), `/uitnodiging/<token>`
- `app/api/` — API-routes (auth, upload, bestanden, deel/link, deel/account, download, gebruikers, backup)
- `lib/` — `db.ts` (SQLite-schema), `auth.ts` (scrypt + HMAC-sessie), `deel.ts` (links + download-grant),
  `bestandStream.ts` (streamen met Range), `format.ts`
- `components/` — `AuthGate`, `Sidebar`, `Uploader` (chunked), `DeelDialog`, `ThemeProvider`

## Privacy

Bestanden staan in `data/bestanden/` **buiten** `public/` en worden nooit statisch geserveerd. Elke
download loopt via een route die login + eigenaarschap controleert, of via een geldige publieke link
met een kortlevende ondertekende grant (een linkwachtwoord staat nooit in een URL).

Meer details voor ontwikkelaars/agents: zie [AGENTS.md](AGENTS.md).
