import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Mijn groepen (met leden). Elke gebruiker beheert zijn eigen groepen.
export async function GET() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const db = getDb()
  const groepen = db.prepare(`
    SELECT id, naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = groep.id) AS aantal_leden
    FROM groep WHERE eigenaar_id = ? ORDER BY naam COLLATE NOCASE
  `).all(g.id) as { id: number; naam: string; aantal_leden: number }[]

  const ledenStmt = db.prepare(`
    SELECT gl.id, u.id AS gebruiker_id, u.weergavenaam, u.email
    FROM groep_lid gl JOIN gebruiker u ON u.id = gl.gebruiker_id
    WHERE gl.groep_id = ? ORDER BY u.weergavenaam COLLATE NOCASE
  `)
  const metLeden = groepen.map(gr => ({ ...gr, leden: ledenStmt.all(gr.id) }))
  return NextResponse.json({ groepen: metLeden })
}

export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { naam } = await req.json()
  if (!naam || !String(naam).trim()) return NextResponse.json({ error: 'Geef de groep een naam' }, { status: 400 })
  const db = getDb()
  const r = db.prepare('INSERT INTO groep (eigenaar_id, naam) VALUES (?, ?)').run(g.id, String(naam).trim())
  return NextResponse.json({ id: Number(r.lastInsertRowid) })
}

export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id, naam } = await req.json()
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(id, g.id)) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }
  if (naam && String(naam).trim()) db.prepare('UPDATE groep SET naam = ? WHERE id = ?').run(String(naam).trim(), id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(id, g.id)) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }
  db.prepare('DELETE FROM groep WHERE id = ?').run(id) // leden + deelrijen cascaden mee
  return NextResponse.json({ ok: true })
}
