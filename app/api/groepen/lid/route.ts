import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'

export const runtime = 'nodejs'

function magGroep(g: Gebruiker, groepId: number): boolean {
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(groepId, g.id)
}

// Lid toevoegen aan een eigen groep.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { groep_id, gebruiker_id } = await req.json()
  if (!magGroep(g, Number(groep_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()
  if (!db.prepare("SELECT 1 FROM gebruiker WHERE id = ? AND status = 'actief'").get(gebruiker_id)) {
    return NextResponse.json({ error: 'Onbekende gebruiker' }, { status: 400 })
  }
  db.prepare('INSERT OR IGNORE INTO groep_lid (groep_id, gebruiker_id) VALUES (?, ?)').run(Number(groep_id), Number(gebruiker_id))
  return NextResponse.json({ ok: true })
}

// Lid verwijderen uit een eigen groep.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { groep_id, gebruiker_id } = await req.json()
  if (!magGroep(g, Number(groep_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()
  db.prepare('DELETE FROM groep_lid WHERE groep_id = ? AND gebruiker_id = ?').run(Number(groep_id), Number(gebruiker_id))
  return NextResponse.json({ ok: true })
}
