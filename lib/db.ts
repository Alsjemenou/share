import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// De SQLite-database blijft ALTIJD lokaal (netwerk-shares zijn onbetrouwbaar voor
// SQLite-locking/WAL). Alleen de bestanden + upload-temp mogen elders staan.
const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'share.db')

// Privémap voor geüploade bestanden — bewust BUITEN public/ zodat Nginx ze niet
// statisch serveert. Bestanden gaan alleen via routes die login/eigenaarschap of
// een geldige deel-link controleren.
//
// Opslag is te verplaatsen (bijv. naar een SMB/CIFS-mount) via env-vars, zodat de
// lokale schijf klein blijft. Zet BESTAND_DIR en UPLOAD_TMP_DIR bij voorkeur op
// DEZELFDE mount: het afronden van een upload is dan een goedkope 'move' i.p.v. een
// kopie over filesystems heen.
const BESTAND_DIR = process.env.SHARE_BESTAND_DIR
  ? path.resolve(process.env.SHARE_BESTAND_DIR)
  : path.join(DB_DIR, 'bestanden')
// Tijdelijke map voor lopende (hervatbare) uploads.
const UPLOAD_TMP_DIR = process.env.SHARE_UPLOAD_TMP_DIR
  ? path.resolve(process.env.SHARE_UPLOAD_TMP_DIR)
  : path.join(DB_DIR, 'uploads-tmp')
// Huisstijl-logo's (klein) — bewust LOKAAL, altijd beschikbaar, buiten public/.
const MERK_DIR = path.join(DB_DIR, 'merk')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  for (const d of [DB_DIR, BESTAND_DIR, UPLOAD_TMP_DIR, MERK_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  }
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}

export { DB_PATH, BESTAND_DIR, UPLOAD_TMP_DIR, MERK_DIR }

function migrate(db: Database.Database) {
  // ── Gebruikers ──────────────────────────────────────────────────────────────
  // Elke gebruiker ziet uitsluitend de eigen bestanden + bestanden die met hem/haar
  // gedeeld zijn. Een beheerder (is_admin, "super") ziet alles.
  // Uitgenodigde accounts hebben nog geen wachtwoord (status = 'uitgenodigd').
  db.exec(`
    CREATE TABLE IF NOT EXISTS gebruiker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gebruikersnaam TEXT NOT NULL UNIQUE COLLATE NOCASE,
      weergavenaam TEXT NOT NULL,
      email TEXT UNIQUE COLLATE NOCASE,
      wachtwoord_hash TEXT,                 -- formaat: scrypt$<saltHex>$<hashHex>; NULL = nog niet ingesteld
      is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'actief', -- 'actief' | 'uitgenodigd'
      invite_token TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Huisstijl per gebruiker (branding/skin): bedrijfsnaam, tagline, accentkleur, logo.
  // Toegepast in de eigen app-weergave én op de publieke deel-/uitnodigingspagina's.
  {
    const cols = db.prepare('PRAGMA table_info(gebruiker)').all() as { name: string }[]
    const heeft = (n: string) => cols.some(c => c.name === n)
    if (!heeft('merk_naam')) db.exec('ALTER TABLE gebruiker ADD COLUMN merk_naam TEXT')
    if (!heeft('merk_subtitel')) db.exec('ALTER TABLE gebruiker ADD COLUMN merk_subtitel TEXT')
    if (!heeft('merk_kleur')) db.exec('ALTER TABLE gebruiker ADD COLUMN merk_kleur TEXT')
    if (!heeft('merk_logo')) db.exec('ALTER TABLE gebruiker ADD COLUMN merk_logo TEXT')
  }

  // ── Bestanden ────────────────────────────────────────────────────────────────
  // Fysiek op schijf in data/bestanden/<eigenaar_id>/<opgeslagen_naam>.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bestand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eigenaar_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      opgeslagen_naam TEXT NOT NULL,       -- uuid-naam op schijf
      originele_naam TEXT NOT NULL,        -- naam zoals geüpload (voor download)
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      grootte INTEGER NOT NULL DEFAULT 0,  -- bytes
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bestand_eigenaar ON bestand(eigenaar_id, created_at);
  `)

  // ── Publieke deel-links (WeTransfer-stijl) ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS deel_link (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bestand_id INTEGER NOT NULL REFERENCES bestand(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      wachtwoord_hash TEXT,                 -- NULL = geen wachtwoord
      verloopt_op TEXT,                     -- NULL = geen verloop; ISO-datum/tijd
      max_downloads INTEGER,                -- NULL = onbeperkt
      download_count INTEGER NOT NULL DEFAULT 0,
      actief INTEGER NOT NULL DEFAULT 1,
      aangemaakt_door INTEGER REFERENCES gebruiker(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deellink_bestand ON deel_link(bestand_id);
  `)

  // ── Delen naar een specifiek account ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS deel_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bestand_id INTEGER NOT NULL REFERENCES bestand(id) ON DELETE CASCADE,
      gebruiker_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      gedeeld_door INTEGER REFERENCES gebruiker(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(bestand_id, gebruiker_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deelacc_gebruiker ON deel_account(gebruiker_id);
  `)

  // ── Download-logboek (tracking) ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bestand_id INTEGER REFERENCES bestand(id) ON DELETE SET NULL,
      deel_link_id INTEGER REFERENCES deel_link(id) ON DELETE SET NULL,
      gebruiker_id INTEGER REFERENCES gebruiker(id) ON DELETE SET NULL, -- NULL = anoniem (publieke link)
      ip TEXT,
      tijd TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_downloadlog_link ON download_log(deel_link_id);
    CREATE INDEX IF NOT EXISTS idx_downloadlog_bestand ON download_log(bestand_id);
  `)

  // ── Mappen (geneste projectmappen) ────────────────────────────────────────────
  // Een map hoort bij één eigenaar en kan een oudermap hebben (nesting).
  db.exec(`
    CREATE TABLE IF NOT EXISTS map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eigenaar_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      naam TEXT NOT NULL,
      ouder_id INTEGER REFERENCES map(id) ON DELETE CASCADE,  -- NULL = in de hoofdmap
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_map_eigenaar ON map(eigenaar_id, ouder_id);
  `)

  // Bestand kan in een map staan (NULL = hoofdmap). Verwijderen van een map zet
  // de bestanden terug naar de hoofdmap (SET NULL), niet weggooien.
  const bCols = db.prepare('PRAGMA table_info(bestand)').all() as { name: string }[]
  if (!bCols.some(c => c.name === 'map_id')) {
    db.exec('ALTER TABLE bestand ADD COLUMN map_id INTEGER REFERENCES map(id) ON DELETE SET NULL')
  }

  // ── Groepen (elke gebruiker beheert zijn eigen groepen) ───────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS groep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eigenaar_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      naam TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS groep_lid (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groep_id INTEGER NOT NULL REFERENCES groep(id) ON DELETE CASCADE,
      gebruiker_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(groep_id, gebruiker_id)
    );
    CREATE INDEX IF NOT EXISTS idx_groeplid_gebruiker ON groep_lid(gebruiker_id);
  `)

  // ── Bestand gedeeld met een groep ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS deel_groep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bestand_id INTEGER NOT NULL REFERENCES bestand(id) ON DELETE CASCADE,
      groep_id INTEGER NOT NULL REFERENCES groep(id) ON DELETE CASCADE,
      gedeeld_door INTEGER REFERENCES gebruiker(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(bestand_id, groep_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deelgroep_groep ON deel_groep(groep_id);
  `)

  // ── Map gedeeld met een account of groep ──────────────────────────────────────
  // Deelt de hele (sub)boom: alle bestanden in de map en submappen, ook later
  // toegevoegde. ontvanger_type bepaalt of ontvanger_id een gebruiker of groep is.
  db.exec(`
    CREATE TABLE IF NOT EXISTS deel_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL REFERENCES map(id) ON DELETE CASCADE,
      ontvanger_type TEXT NOT NULL,        -- 'account' | 'groep'
      ontvanger_id INTEGER NOT NULL,
      gedeeld_door INTEGER REFERENCES gebruiker(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(map_id, ontvanger_type, ontvanger_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deelmap_map ON deel_map(map_id);
  `)

  // ── Lopende uploads (hervatbaar / chunked) ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_sessie (
      upload_id TEXT PRIMARY KEY,
      eigenaar_id INTEGER NOT NULL REFERENCES gebruiker(id) ON DELETE CASCADE,
      originele_naam TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      grootte INTEGER NOT NULL,            -- verwachte totaalgrootte in bytes
      ontvangen_bytes INTEGER NOT NULL DEFAULT 0,
      tmp_pad TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  // map_id op upload_sessie: in welke map de upload terechtkomt (NULL = hoofdmap).
  const uCols = db.prepare('PRAGMA table_info(upload_sessie)').all() as { name: string }[]
  if (!uCols.some(c => c.name === 'map_id')) {
    db.exec('ALTER TABLE upload_sessie ADD COLUMN map_id INTEGER')
  }
}
