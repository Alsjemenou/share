import { NextRequest, NextResponse } from 'next/server'
import { getDb, closeDb, DB_PATH } from '@/lib/db'
import { vereisAdmin } from '@/lib/auth'
import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto'

export const runtime = 'nodejs'

// ── Versleuteling (AES-256-GCM met BACKUP_ENC_KEY) ───────────────────────────────
// Formaat: "DBK1" | salt(16) | iv(12) | authTag(16) | ciphertext. Zonder sleutel
// wordt een gewone .zip weggeschreven. Herstellen vereist dezelfde sleutel.
const MAGIC = Buffer.from('DBK1')

function versleutel(buf: Buffer): { data: Buffer; ext: string } {
  const pass = process.env.BACKUP_ENC_KEY
  if (!pass) return { data: buf, ext: 'zip' }
  const salt = randomBytes(16)
  const key = scryptSync(pass, salt, 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(buf), cipher.final()])
  const tag = cipher.getAuthTag()
  return { data: Buffer.concat([MAGIC, salt, iv, tag, enc]), ext: 'zip.enc' }
}

function ontsleutel(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).toString() !== 'DBK1') return buf // gewone zip
  const pass = process.env.BACKUP_ENC_KEY
  if (!pass) throw new Error('Deze back-up is versleuteld, maar BACKUP_ENC_KEY ontbreekt op de server.')
  const salt = buf.subarray(4, 20)
  const iv = buf.subarray(20, 32)
  const tag = buf.subarray(32, 48)
  const data = buf.subarray(48)
  const key = scryptSync(pass, salt, 32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

// ── Config (in de instellingen-tabel als JSON onder sleutel 'smb_config') ─────────
interface SmbConfig {
  server: string
  share: string
  pad: string
  domein: string
  gebruiker: string
  wachtwoord: string
  auto_enabled: boolean
  auto_freq: 'dagelijks' | 'wekelijks'
  auto_weekdag: number   // 0=zondag .. 6=zaterdag
  bewaar_aantal: number
}

const LEEG: SmbConfig = {
  server: '', share: '', pad: '', domein: 'WORKGROUP', gebruiker: '', wachtwoord: '',
  auto_enabled: false, auto_freq: 'dagelijks', auto_weekdag: 0, bewaar_aantal: 14,
}

const TMP_DB = path.join(process.cwd(), 'data', '_smb-backup-tmp.db')
const BESTAND_RE = /^deel-backup-.*\.(zip|zip\.enc)$/i

function readConfig(): SmbConfig | null {
  const db = getDb()
  const row = db.prepare("SELECT waarde FROM instellingen WHERE sleutel='smb_config'").get() as { waarde: string } | undefined
  if (!row) return null
  try { return { ...LEEG, ...JSON.parse(row.waarde) } } catch { return null }
}
function saveConfig(cfg: SmbConfig) {
  getDb().prepare('INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES (?, ?)').run('smb_config', JSON.stringify(cfg))
}

// Alleen de database (geen bestanden — die staan op de QNAP en hebben hun eigen back-up).
async function maakZip(): Promise<Buffer> {
  const db = getDb()
  db.pragma('wal_checkpoint(TRUNCATE)')
  await db.backup(TMP_DB)
  const zip = new AdmZip()
  zip.addLocalFile(TMP_DB, '', 'share.db')
  zip.addFile('backup-info.json', Buffer.from(JSON.stringify({ versie: '1.0', datum: new Date().toISOString(), app: 'Deel' }, null, 2)))
  try { fs.unlinkSync(TMP_DB) } catch { /* ignore */ }
  return zip.toBuffer()
}

// ── SMB-helpers (callback → promise) ─────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
async function maakSmb(cfg: SmbConfig): Promise<any> {
  const mod: any = await import('@marsaud/smb2')
  const SMB2 = mod.default ?? mod
  return new SMB2({
    share: `\\\\${cfg.server}\\${cfg.share}`,
    domain: cfg.domein || 'WORKGROUP',
    username: cfg.gebruiker,
    password: cfg.wachtwoord,
    autoCloseTimeout: 10000,
  })
}
const p = <T,>(fn: (cb: (err: any, res?: T) => void) => void) => new Promise<T>((res, rej) => fn((e, r) => e ? rej(e) : res(r as T)))

function metTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Time-out na ${ms / 1000}s — server onbereikbaar of geen antwoord?`)), ms)),
  ])
}

function normPad(cfg: SmbConfig): string {
  return (cfg.pad || '').replace(/\//g, '\\').replace(/^\\+|\\+$/g, '')
}

async function ensureDir(smb: any, dir: string) {
  if (!dir) return
  const delen = dir.split('\\').filter(Boolean)
  let pad = ''
  for (const d of delen) {
    pad = pad ? `${pad}\\${d}` : d
    const bestaat = await p<boolean>(cb => smb.exists(pad, cb)).catch(() => false)
    if (!bestaat) await p(cb => smb.mkdir(pad, cb)).catch(() => { /* race/bestaat al */ })
  }
}

async function lijstBackups(smb: any, dir: string): Promise<string[]> {
  const files = await p<string[]>(cb => smb.readdir(dir || '.', cb))
  return files.filter(f => BESTAND_RE.test(f)).sort().reverse() // nieuwste eerst
}

async function schrijfNaarSmb(cfg: SmbConfig, buffer: Buffer): Promise<string> {
  const smb = await maakSmb(cfg)
  try {
    const dir = normPad(cfg)
    await ensureDir(smb, dir)
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2')
    const { data, ext } = versleutel(buffer)
    const bestand = `deel-backup-${stamp}.${ext}`
    const remote = dir ? `${dir}\\${bestand}` : bestand
    await p(cb => smb.writeFile(remote, data, cb))
    // Oude back-ups opruimen (bewaar de nieuwste N).
    try {
      const backups = (await lijstBackups(smb, dir)).reverse() // oudste eerst
      const teveel = backups.length - (cfg.bewaar_aantal || 14)
      for (let i = 0; i < teveel; i++) {
        await p(cb => smb.unlink(dir ? `${dir}\\${backups[i]}` : backups[i], cb)).catch(() => {})
      }
    } catch { /* opruimen is optioneel */ }
    return bestand
  } finally {
    try { smb.close() } catch { /* ignore */ }
  }
}

// Herstelt de database uit een back-upbestand op de SMB-share.
async function herstelVanSmb(cfg: SmbConfig, bestand: string): Promise<void> {
  if (!BESTAND_RE.test(bestand)) throw new Error('Ongeldige back-upnaam')
  const smb = await maakSmb(cfg)
  let ruw: Buffer
  try {
    const dir = normPad(cfg)
    ruw = await p<Buffer>(cb => smb.readFile(dir ? `${dir}\\${bestand}` : bestand, cb))
  } finally {
    try { smb.close() } catch { /* ignore */ }
  }
  const zipBuf = ontsleutel(Buffer.from(ruw))
  const zip = new AdmZip(zipBuf)
  const dbEntry = zip.getEntries().find(e => e.entryName.endsWith('share.db'))
  if (!dbEntry) throw new Error('Geen share.db in de back-up gevonden')
  closeDb()
  for (const suffix of ['-wal', '-shm']) {
    try { fs.unlinkSync(DB_PATH + suffix) } catch { /* bestaat niet */ }
  }
  fs.writeFileSync(DB_PATH, dbEntry.getData())
  getDb() // heropen → migraties
}

// ── Route ─────────────────────────────────────────────────────────────────────
// GET            → gemaskeerde config (admin)
// GET ?cron=1    → automatische back-up (serverside cron, met ?secret=CRON_SECRET)
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('cron')) {
    if (!process.env.CRON_SECRET || req.nextUrl.searchParams.get('secret') !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const cfg = readConfig()
    if (!cfg || !cfg.auto_enabled || !cfg.server || !cfg.share) return NextResponse.json({ skipped: 'niet ingeschakeld' })
    if (cfg.auto_freq === 'wekelijks' && new Date().getDay() !== cfg.auto_weekdag) return NextResponse.json({ skipped: 'niet de gekozen weekdag' })
    try {
      const bestand = await metTimeout(schrijfNaarSmb(cfg, await maakZip()), 120000)
      return NextResponse.json({ ok: true, bestand })
    } catch (err) {
      console.error('[backup/smb cron]', err)
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  const { fout } = await vereisAdmin()
  if (fout) return fout
  const cfg = readConfig() ?? LEEG
  const versleuteld = !!process.env.BACKUP_ENC_KEY
  return NextResponse.json({ ...cfg, wachtwoord: '', heeft_wachtwoord: !!(readConfig()?.wachtwoord), versleuteld })
}

// PUT → config opslaan (wachtwoord leeg = bestaande behouden)
export async function PUT(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const body = await req.json() as Partial<SmbConfig>
  const oud = readConfig() ?? LEEG
  const tekst = (k: keyof SmbConfig) => body[k] !== undefined ? String(body[k]) : (oud[k] as string)
  // Alleen de echte configvelden overnemen (geen afgeleide velden zoals heeft_wachtwoord).
  const nieuw: SmbConfig = {
    server: tekst('server'), share: tekst('share'), pad: tekst('pad'),
    domein: tekst('domein') || 'WORKGROUP', gebruiker: tekst('gebruiker'),
    wachtwoord: body.wachtwoord ? String(body.wachtwoord) : oud.wachtwoord,
    auto_enabled: body.auto_enabled !== undefined ? !!body.auto_enabled : oud.auto_enabled,
    auto_freq: body.auto_freq === 'wekelijks' ? 'wekelijks' : (body.auto_freq === 'dagelijks' ? 'dagelijks' : oud.auto_freq),
    auto_weekdag: Math.min(6, Math.max(0, Number(body.auto_weekdag ?? oud.auto_weekdag) || 0)),
    bewaar_aantal: Math.max(1, Number(body.bewaar_aantal ?? oud.bewaar_aantal) || 14),
  }
  saveConfig(nieuw)
  return NextResponse.json({ ok: true })
}

// POST { _actie: 'test' | 'nu' | 'lijst' | 'herstel', bestand? }
export async function POST(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const { _actie, bestand } = await req.json()
  const cfg = readConfig()
  if (!cfg || !cfg.server || !cfg.share) return NextResponse.json({ error: 'SMB nog niet geconfigureerd' }, { status: 400 })

  try {
    if (_actie === 'test') {
      const smb = await maakSmb(cfg)
      try {
        const dir = normPad(cfg)
        await metTimeout(ensureDir(smb, dir), 25000)
        await metTimeout(p<string[]>(cb => smb.readdir(dir || '.', cb)), 25000)
        return NextResponse.json({ ok: true, bericht: 'Verbinding en map OK' })
      } finally { try { smb.close() } catch { /* ignore */ } }
    }
    if (_actie === 'nu') {
      const naam = await metTimeout(schrijfNaarSmb(cfg, await maakZip()), 120000)
      return NextResponse.json({ ok: true, bestand: naam })
    }
    if (_actie === 'lijst') {
      const smb = await maakSmb(cfg)
      try {
        const backups = await metTimeout(lijstBackups(smb, normPad(cfg)), 25000)
        return NextResponse.json({ ok: true, backups })
      } finally { try { smb.close() } catch { /* ignore */ } }
    }
    if (_actie === 'herstel') {
      await metTimeout(herstelVanSmb(cfg, String(bestand || '')), 120000)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
  } catch (err) {
    console.error('[backup/smb]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
