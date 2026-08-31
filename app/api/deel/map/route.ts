import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magMapBeheren, maakDeelToken } from '@/lib/deel'

export const runtime = 'nodejs'

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// Met wie is een map gedeeld (accounts + groepen)?
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const mapId = Number(req.nextUrl.searchParams.get('map'))
  if (!magMapBeheren(g, mapId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()

  const accounts = db.prepare(`
    SELECT dm.id, u.id AS gebruiker_id, u.weergavenaam, u.email, u.status, u.invite_token
    FROM deel_map dm JOIN gebruiker u ON u.id = dm.ontvanger_id
    WHERE dm.map_id = ? AND dm.ontvanger_type = 'account' ORDER BY u.weergavenaam COLLATE NOCASE
  `).all(mapId)
  const groepen = db.prepare(`
    SELECT dm.id, gr.id AS groep_id, gr.naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = gr.id) AS aantal_leden
    FROM deel_map dm JOIN groep gr ON gr.id = dm.ontvanger_id
    WHERE dm.map_id = ? AND dm.ontvanger_type = 'groep' ORDER BY gr.naam COLLATE NOCASE
  `).all(mapId)
  return NextResponse.json({ accounts, groepen })
}

// Map delen met een groep (eigen groep) of met een account (op naam/e-mail, met uitnodiging).
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { map_id, groep_id, ontvanger } = await req.json()
  if (!magMapBeheren(g, Number(map_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()

  // ── Met een groep ─────────────────────────────────────────────────────────
  if (groep_id != null) {
    if (!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(groep_id, g.id)) {
      return NextResponse.json({ error: 'Groep niet gevonden' }, { status: 400 })
    }
    db.prepare("INSERT OR IGNORE INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door) VALUES (?, 'groep', ?, ?)")
      .run(Number(map_id), Number(groep_id), g.id)
    return NextResponse.json({ ok: true })
  }

  // ── Met een account (op naam/e-mail) ──────────────────────────────────────
  const invoer = String(ontvanger || '').trim()
  if (!invoer) return NextResponse.json({ error: 'Kies een groep of vul een naam/e-mail in' }, { status: 400 })
  const email = isEmail(invoer) ? invoer : null

  let account = db.prepare(
    'SELECT id, weergavenaam, email, status, invite_token FROM gebruiker WHERE email = ? OR gebruikersnaam = ?'
  ).get(email, invoer) as
    | { id: number; weergavenaam: string; email: string | null; status: string; invite_token: string | null }
    | undefined

  let nieuweUitnodiging = false
  if (!account) {
    let gebruikersnaam = email || invoer
    if (db.prepare('SELECT 1 FROM gebruiker WHERE gebruikersnaam = ?').get(gebruikersnaam)) {
      gebruikersnaam = `${gebruikersnaam}-${maakDeelToken(3)}`
    }
    const token = maakDeelToken()
    const r = db.prepare(`
      INSERT INTO gebruiker (gebruikersnaam, weergavenaam, email, is_admin, status, invite_token)
      VALUES (?, ?, ?, 0, 'uitgenodigd', ?)
    `).run(gebruikersnaam, invoer, email, token)
    account = { id: Number(r.lastInsertRowid), weergavenaam: invoer, email, status: 'uitgenodigd', invite_token: token }
    nieuweUitnodiging = true
  }

  db.prepare("INSERT OR IGNORE INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door) VALUES (?, 'account', ?, ?)")
    .run(Number(map_id), account.id, g.id)

  const uitnodiging = account.status !== 'actief' && account.invite_token
    ? { token: account.invite_token, nieuw: nieuweUitnodiging } : null
  return NextResponse.json({
    ok: true,
    account: { id: account.id, weergavenaam: account.weergavenaam, email: account.email, status: account.status },
    uitnodiging,
  })
}

// Deling van een map intrekken.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const rij = db.prepare('SELECT map_id FROM deel_map WHERE id = ?').get(id) as { map_id: number } | undefined
  if (!rij || !magMapBeheren(g, rij.map_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM deel_map WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
