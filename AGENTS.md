# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Over dit project

Deel — een webapp om **bestanden te delen**: als eigen NAS-/WeTransfer-vervanging, zonder je NAS
aan internet bloot te stellen. Zusje van `financieel-dashboard`, `boekhouding` en `sport`; zelfde
stack: Next.js 16, React 19, better-sqlite3, Tailwind v4, PM2 + Nginx.

- Draait intern op **poort 3005** (op dezelfde host, naast finance 3000, boekhouding 3001, sport 3002, vmware 3003, sauman 3004).
- Bereikbaar via **share.local / 192.168.2.42**.
- Database: `data/share.db` (SQLite, WAL) — **blijft altijd lokaal** (netwerk-shares zijn onbetrouwbaar voor SQLite-locking).
- Bestanden: `data/bestanden/<eigenaar_id>/…` — **bewust buiten `public/`** (privé).
- Lopende (hervatbare) uploads: `data/uploads-tmp/`.
- **Opslag verplaatsbaar** (bijv. naar een SMB/CIFS-mount, zodat de lokale schijf klein blijft): zet `SHARE_BESTAND_DIR` en `SHARE_UPLOAD_TMP_DIR` (in `lib/db.ts`). Zet ze op **dezelfde** mount, want `finish` doet een `rename` (goedkope move binnen één filesystem; cross-fs valt terug op kopiëren). Zie DEPLOY.md.

## Twee manieren van delen

1. **Publieke link** (WeTransfer-stijl): een `deel_link` met optioneel **wachtwoord**, **verloopdatum**
   en **downloadlimiet**; downloads worden **geteld en gelogd**. Openbaar te openen op `/d/<token>`.
2. **Naar een account**: een `deel_account`-koppeling. De ontvanger ziet het bestand onder
   "Gedeeld met mij". Bestaat er nog geen account, dan wordt een **uitgenodigd** account +
   **invite-link** (`/uitnodiging/<token>`) aangemaakt — de deler stuurt die zelf door (geen SMTP).

## Belangrijk: privacy & scheiding

- **Authenticatie is verplicht** voor het app-gedeelte. Een gewone gebruiker ziet alleen **eigen
  bestanden + bestanden die met hem/haar gedeeld zijn**. Een **beheerder** (`is_admin`, "super")
  ziet alles.
- Bestanden worden **nooit statisch geserveerd**. Ze gaan uitsluitend via routes die login +
  `magBestandZien()` controleren (`/api/bestand/[id]/download`) of via een geldige publieke link
  met kortlevende, ondertekende **download-grant** (`/api/download/[token]/bestand`). Zet dus **geen**
  `location /data/` of `location /bestanden/` in Nginx.
- Publieke pagina's (`/d/…`, `/uitnodiging/…`) staan in route-group `app/(public)/` **buiten** de
  `AuthGate`; het afgeschermde deel staat in `app/(app)/`.
- Wachtwoorden: scrypt-hash (`lib/auth.ts`). Sessie = ondertekende cookie (HMAC), geheim in
  `data/.session-secret`. Een linkwachtwoord staat nooit in een URL (zie download-grant in `lib/deel.ts`).

## Grote bestanden (chunked / resumable upload)

Uploads gaan in stukken van 8 MB via `POST /api/upload/{start,chunk,finish}` met `GET /api/upload/status`
om te hervatten. De client is `components/Uploader.tsx`. Nginx ziet zo alleen kleine chunks — daarom
mag `client_max_body_size` klein blijven. Het samengevoegde `.part`-bestand wordt bij `finish` naar
`data/bestanden/<eigenaar_id>/` verplaatst en in de tabel `bestand` vastgelegd.

## Modules

- **Mijn bestanden** (`/`): uploaden, lijst, delen (`DeelDialog`), downloaden, verwijderen.
- **Gedeeld met mij** (`/gedeeld`): bestanden die anderen met je account deelden.
- **Beheer** (`/beheer`, alleen beheerder): alle bestanden, personen, database-back-up.
- **Instellingen** (`/instellingen`): eigen profiel/wachtwoord, thema.

## Eerste gebruik

Bij nul actieve gebruikers toont de app een **setup-scherm**: het eerste account wordt de beheerder.
Daarna is open registratie gesloten; nieuwe personen ontstaan via **Beheer → Personen** of automatisch
als **uitgenodigd** account wanneer je een bestand met een nieuw e-mailadres deelt.
