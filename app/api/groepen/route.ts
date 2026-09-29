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
    SELECT groep.id, groep.naam, groep.map_id, m.naam AS map_naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = groep.id) AS aantal_leden,
           (SELECT COUNT(*) FROM bestand b WHERE b.map_id = groep.map_id) AS aantal_bestanden
    FROM groep LEFT JOIN map m ON m.id = groep.map_id
    WHERE groep.eigenaar_id = ? ORDER BY groep.naam COLLATE NOCASE
  `).all(g.id) as { id: number; naam: string; map_id: number | null; map_naam: string | null; aantal_leden: number; aantal_bestanden: number }[]

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
  const naamW = String(naam || '').trim()
  if (!naamW) return NextResponse.json({ error: 'Geef de groep een naam' }, { status: 400 })
  const db = getDb()
  const r = db.prepare('INSERT INTO groep (eigenaar_id, naam) VALUES (?, ?)').run(g.id, naamW)
  const groepId = Number(r.lastInsertRowid)

  // Automatisch een groepsmap aanmaken en als teammap met de groep delen, zodat
  // alle leden meteen dezelfde map hebben en er bestanden in kunnen zetten.
  const mr = db.prepare('INSERT INTO map (eigenaar_id, naam, ouder_id) VALUES (?, ?, NULL)').run(g.id, naamW)
  const mapId = Number(mr.lastInsertRowid)
  db.prepare("INSERT INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door, mag_uploaden) VALUES (?, 'groep', ?, ?, 1)")
    .run(mapId, groepId, g.id)
  db.prepare('UPDATE groep SET map_id = ? WHERE id = ?').run(mapId, groepId)

  return NextResponse.json({ id: groepId, map_id: mapId })
}

export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id, naam } = await req.json()
  const db = getDb()
  const gr = db.prepare('SELECT map_id FROM groep WHERE id = ? AND eigenaar_id = ?').get(id, g.id) as { map_id: number | null } | undefined
  if (!gr) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const naamW = String(naam || '').trim()
  if (naamW) {
    db.prepare('UPDATE groep SET naam = ? WHERE id = ?').run(naamW, id)
    if (gr.map_id != null) db.prepare('UPDATE map SET naam = ? WHERE id = ?').run(naamW, gr.map_id) // groepsmap meehernoemen
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const gr = db.prepare('SELECT map_id FROM groep WHERE id = ? AND eigenaar_id = ?').get(id, g.id) as { map_id: number | null } | undefined
  if (!gr) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  // Groepsmap verwijderen (bestanden erin gaan naar de hoofdmap; deel_map cascadeert).
  if (gr.map_id != null) db.prepare('DELETE FROM map WHERE id = ?').run(gr.map_id)
  db.prepare('DELETE FROM groep WHERE id = ?').run(id) // leden cascaden mee
  return NextResponse.json({ ok: true })
}
