import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, hashWachtwoord, type Gebruiker } from '@/lib/auth'
import { maakDeelToken } from '@/lib/deel'

export const runtime = 'nodejs'

// Controleert of de gebruiker dit bestand mag beheren (eigenaar of beheerder).
function magBeheren(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
}

// Lijst publieke links voor een bestand.
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const bestandId = Number(req.nextUrl.searchParams.get('bestand'))
  if (!magBeheren(g, bestandId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const db = getDb()
  const links = db.prepare(`
    SELECT id, token, verloopt_op, max_downloads, download_count, actief, created_at,
           (wachtwoord_hash IS NOT NULL) AS heeft_wachtwoord
    FROM deel_link WHERE bestand_id = ? ORDER BY created_at DESC
  `).all(bestandId)
  return NextResponse.json({ links })
}

// Maak een nieuwe publieke link met opties.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { bestand_id, wachtwoord, verloop_dagen, max_downloads } = await req.json()
  if (!magBeheren(g, Number(bestand_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let verlooptOp: string | null = null
  const dagen = Number(verloop_dagen)
  if (Number.isFinite(dagen) && dagen > 0) {
    verlooptOp = new Date(Date.now() + dagen * 86400_000).toISOString()
  }
  let maxDl: number | null = null
  const md = Number(max_downloads)
  if (Number.isFinite(md) && md > 0) maxDl = Math.floor(md)

  const token = maakDeelToken()
  const db = getDb()
  db.prepare(`
    INSERT INTO deel_link (bestand_id, token, wachtwoord_hash, verloopt_op, max_downloads, aangemaakt_door)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(bestand_id),
    token,
    wachtwoord && String(wachtwoord).length > 0 ? hashWachtwoord(String(wachtwoord)) : null,
    verlooptOp,
    maxDl,
    g.id,
  )
  return NextResponse.json({ token })
}

// Link in-/uitschakelen.
export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id, actief } = await req.json()
  const db = getDb()
  const link = db.prepare('SELECT bestand_id FROM deel_link WHERE id = ?').get(id) as { bestand_id: number } | undefined
  if (!link || !magBeheren(g, link.bestand_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('UPDATE deel_link SET actief = ? WHERE id = ?').run(actief ? 1 : 0, id)
  return NextResponse.json({ ok: true })
}

// Link definitief verwijderen.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const link = db.prepare('SELECT bestand_id FROM deel_link WHERE id = ?').get(id) as { bestand_id: number } | undefined
  if (!link || !magBeheren(g, link.bestand_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM deel_link WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
