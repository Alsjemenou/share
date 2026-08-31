import crypto from 'crypto'
import { getDb } from '@/lib/db'
import { hmacTeken, hmacCheck, type Gebruiker } from '@/lib/auth'

// Urlsafe willekeurige token voor deel-links en uitnodigingen.
export function maakDeelToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

// ── Download-grant ────────────────────────────────────────────────────────────
// Kortstondig, ondertekend bewijs dat de download voor een publieke link is
// vrijgegeven (bijv. na wachtwoordcontrole). Zo hoeft een linkwachtwoord nooit
// in een URL te staan, terwijl de download een gewone GET blijft (range-vriendelijk).
const GRANT_GELDIG_MS = 10 * 60 * 1000 // 10 minuten

export function maakGrant(linkId: number): string {
  const body = Buffer.from(JSON.stringify({ lid: linkId, exp: Date.now() + GRANT_GELDIG_MS })).toString('base64url')
  return `${body}.${hmacTeken(body)}`
}

export function leesGrant(grant: string | null | undefined): number | null {
  if (!grant) return null
  const [body, sig] = grant.split('.')
  if (!body || !sig || !hmacCheck(body, sig)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof p.lid !== 'number' || typeof p.exp !== 'number' || Date.now() > p.exp) return null
    return p.lid
  } catch {
    return null
  }
}

export type DeelLink = {
  id: number
  bestand_id: number
  token: string
  wachtwoord_hash: string | null
  verloopt_op: string | null
  max_downloads: number | null
  download_count: number
  actief: number
}

// Waarom een publieke link niet (meer) geldig is — of null als hij goed is.
export function linkOngeldigReden(link: DeelLink): string | null {
  if (!link.actief) return 'Deze link is uitgeschakeld.'
  if (link.verloopt_op && Date.now() > Date.parse(link.verloopt_op)) return 'Deze link is verlopen.'
  if (link.max_downloads != null && link.download_count >= link.max_downloads) {
    return 'Het maximum aantal downloads voor deze link is bereikt.'
  }
  return null
}

// Mag deze (ingelogde) gebruiker dit bestand zien/downloaden?
// Eigenaar | beheerder | expliciet gedeeld naar dit account.
export function magBestandZien(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  const eigen = db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
  if (eigen) return true
  const gedeeld = db.prepare('SELECT 1 FROM deel_account WHERE bestand_id = ? AND gebruiker_id = ?').get(bestandId, g.id)
  return !!gedeeld
}
