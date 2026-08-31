import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const SESSIE_COOKIE = 'deel_sessie'
const SESSIE_DAGEN = 30
const SECRET_PATH = path.join(process.cwd(), 'data', '.session-secret')

export type Gebruiker = {
  id: number
  gebruikersnaam: string
  weergavenaam: string
  email: string | null
  is_admin: number
  status: string
}

// ── Sessiegeheim (voor cookie-ondertekening) ────────────────────────────────
// Genereert bij eerste gebruik een willekeurig geheim en bewaart dat in data/.
// Zo blijven sessies geldig na herstart, zonder dat het geheim in de repo staat.
function getSecret(): Buffer {
  const uitEnv = process.env.SHARE_SESSION_SECRET
  if (uitEnv && uitEnv.length >= 16) return Buffer.from(uitEnv)
  try {
    if (fs.existsSync(SECRET_PATH)) return Buffer.from(fs.readFileSync(SECRET_PATH, 'utf8').trim(), 'hex')
  } catch { /* val terug op genereren */ }
  const geheim = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(SECRET_PATH), { recursive: true })
  fs.writeFileSync(SECRET_PATH, geheim.toString('hex'), { mode: 0o600 })
  return geheim
}

// ── Wachtwoord-hashing (scrypt, ingebouwd in Node) ──────────────────────────
export function hashWachtwoord(wachtwoord: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(wachtwoord, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function checkWachtwoord(wachtwoord: string, opgeslagen: string | null | undefined): boolean {
  if (!opgeslagen) return false
  const delen = opgeslagen.split('$')
  if (delen.length !== 3 || delen[0] !== 'scrypt') return false
  const salt = Buffer.from(delen[1], 'hex')
  const verwacht = Buffer.from(delen[2], 'hex')
  const hash = crypto.scryptSync(wachtwoord, salt, verwacht.length)
  return hash.length === verwacht.length && crypto.timingSafeEqual(hash, verwacht)
}

// ── Sessietoken (ondertekende cookie) ───────────────────────────────────────
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function tekenen(data: string): string {
  return b64url(crypto.createHmac('sha256', getSecret()).update(data).digest())
}

// Algemene HMAC-ondertekening (voor korte 'download-grants' bij publieke links).
export function hmacTeken(data: string): string {
  return tekenen(data)
}
export function hmacCheck(data: string, sig: string): boolean {
  const verwacht = tekenen(data)
  return sig.length === verwacht.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(verwacht))
}

export function maakToken(gebruikerId: number): string {
  const payload = { uid: gebruikerId, exp: Date.now() + SESSIE_DAGEN * 86400_000 }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${tekenen(body)}`
}

function leesToken(token: string | undefined): number | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const verwacht = tekenen(body)
  if (sig.length !== verwacht.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(verwacht))) return null
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (typeof payload.uid !== 'number' || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null
    return payload.uid
  } catch {
    return null
  }
}

// ── Huidige gebruiker uit de request-cookie ─────────────────────────────────
export async function huidigeGebruiker(): Promise<Gebruiker | null> {
  const store = await cookies()
  const uid = leesToken(store.get(SESSIE_COOKIE)?.value)
  if (!uid) return null
  const db = getDb()
  const g = db.prepare(
    "SELECT id, gebruikersnaam, weergavenaam, email, is_admin, status FROM gebruiker WHERE id = ? AND status = 'actief'"
  ).get(uid) as Gebruiker | undefined
  return g ?? null
}

// Handige 401-helper voor API-routes.
export function nietIngelogd() {
  return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
}

// Vereist een ingelogde beheerder. Geeft { fout } of { g }.
export async function vereisAdmin(): Promise<{ fout: NextResponse | null; g: Gebruiker | null }> {
  const g = await huidigeGebruiker()
  if (!g) return { fout: nietIngelogd(), g: null }
  if (!g.is_admin) return { fout: NextResponse.json({ error: 'Alleen voor beheerders' }, { status: 403 }), g: null }
  return { fout: null, g }
}

// Zet/verwijder de sessiecookie op een response.
export function zetSessieCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSIE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSIE_DAGEN * 86400,
  })
}
export function wisSessieCookie(res: NextResponse) {
  res.cookies.set(SESSIE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

// Aantal ECHTE (actieve) gebruikers — bepaalt of we in 'setup'-modus zitten.
// Uitgenodigde accounts zonder wachtwoord tellen niet mee.
export function aantalGebruikers(): number {
  const db = getDb()
  return (db.prepare("SELECT COUNT(*) n FROM gebruiker WHERE status = 'actief'").get() as { n: number }).n
}
