import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magBestandBeheren } from '@/lib/deel'

export const runtime = 'nodejs'

// Groepen waarmee een bestand gedeeld is.
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const bestandId = Number(req.nextUrl.searchParams.get('bestand'))
  if (!magBestandBeheren(g, bestandId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()
  const groepen = db.prepare(`
    SELECT dg.id, dg.groep_id, gr.naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = gr.id) AS aantal_leden
    FROM deel_groep dg JOIN groep gr ON gr.id = dg.groep_id
    WHERE dg.bestand_id = ? ORDER BY gr.naam COLLATE NOCASE
  `).all(bestandId)
  return NextResponse.json({ groepen })
}

// Bestand met een (eigen) groep delen.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { bestand_id, groep_id } = await req.json()
  if (!magBestandBeheren(g, Number(bestand_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(groep_id, g.id)) {
    return NextResponse.json({ error: 'Groep niet gevonden' }, { status: 400 })
  }
  db.prepare('INSERT OR IGNORE INTO deel_groep (bestand_id, groep_id, gedeeld_door) VALUES (?, ?, ?)')
    .run(Number(bestand_id), Number(groep_id), g.id)
  return NextResponse.json({ ok: true })
}

// Deling met een groep intrekken.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const rij = db.prepare('SELECT bestand_id FROM deel_groep WHERE id = ?').get(id) as { bestand_id: number } | undefined
  if (!rij || !magBestandBeheren(g, rij.bestand_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM deel_groep WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
