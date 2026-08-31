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

// Deelt de map (of een van zijn voorouders) toegang uit aan deze gebruiker —
// direct op zijn account of via een groep waar hij lid van is? Werkt op een
// map-id-keten (voorouders) die de aanroeper aanlevert via de CTE-startset.
const DEEL_MAP_MATCH = `
  SELECT 1 FROM deel_map dm WHERE dm.map_id IN (SELECT id FROM keten) AND (
    (dm.ontvanger_type = 'account' AND dm.ontvanger_id = @u)
    OR (dm.ontvanger_type = 'groep' AND dm.ontvanger_id IN (SELECT groep_id FROM groep_lid WHERE gebruiker_id = @u))
  ) LIMIT 1
`

// Mag deze (ingelogde) gebruiker dit bestand zien/downloaden?
// Eigenaar | beheerder | direct met account gedeeld | via groep gedeeld |
// het bestand zit in een (voorouder)map die met de gebruiker/zijn groep gedeeld is.
export function magBestandZien(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  if (db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)) return true
  if (db.prepare('SELECT 1 FROM deel_account WHERE bestand_id = ? AND gebruiker_id = ?').get(bestandId, g.id)) return true
  if (db.prepare(
    `SELECT 1 FROM deel_groep dg JOIN groep_lid gl ON gl.groep_id = dg.groep_id
     WHERE dg.bestand_id = ? AND gl.gebruiker_id = ?`
  ).get(bestandId, g.id)) return true
  // Via de mappenketen (bestand → map → oudermap → …).
  const viaMap = db.prepare(`
    WITH RECURSIVE keten(id) AS (
      SELECT map_id FROM bestand WHERE id = @f AND map_id IS NOT NULL
      UNION
      SELECT m.ouder_id FROM map m JOIN keten k ON m.id = k.id WHERE m.ouder_id IS NOT NULL
    )
    ${DEEL_MAP_MATCH}
  `).get({ f: bestandId, u: g.id })
  return !!viaMap
}

// Mag deze gebruiker deze map inzien/bladeren?
// Eigenaar | beheerder | de map of een voorouder is met de gebruiker/zijn groep gedeeld.
export function magMapZien(g: Gebruiker, mapId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  const m = db.prepare('SELECT eigenaar_id FROM map WHERE id = ?').get(mapId) as { eigenaar_id: number } | undefined
  if (!m) return false
  if (m.eigenaar_id === g.id) return true
  const via = db.prepare(`
    WITH RECURSIVE keten(id) AS (
      SELECT @m
      UNION
      SELECT mm.ouder_id FROM map mm JOIN keten k ON mm.id = k.id WHERE mm.ouder_id IS NOT NULL
    )
    ${DEEL_MAP_MATCH}
  `).get({ m: mapId, u: g.id })
  return !!via
}

// Beheerrecht (delen/hernoemen/verplaatsen/verwijderen): eigenaar of beheerder.
export function magBestandBeheren(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
}
export function magMapBeheren(g: Gebruiker, mapId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(mapId, g.id)
}
