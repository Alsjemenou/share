import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magBestandZien } from '@/lib/deel'
import { serveerBestand } from '@/lib/bestandStream'

export const runtime = 'nodejs'

// Downloadt een bestand ALLEEN als je bent ingelogd én het van jou is, met jou
// gedeeld is, of je beheerder bent. Zo werkt een geraden URL niet.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const { id } = await params
  const db = getDb()
  const b = db.prepare('SELECT id, eigenaar_id, opgeslagen_naam, originele_naam, mime FROM bestand WHERE id = ?').get(id) as
    | { id: number; eigenaar_id: number; opgeslagen_naam: string; originele_naam: string; mime: string }
    | undefined
  if (!b) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  if (!magBestandZien(g, b.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  // Path-traversal voorkomen: opgeslagen naam mag geen mapscheiding bevatten.
  const veilig = path.basename(b.opgeslagen_naam)
  const absPad = path.join(BESTAND_DIR, String(b.eigenaar_id), veilig)

  // Log de download (alleen bij een volledige start, niet bij elke Range-chunk).
  if (!req.headers.get('range')) {
    db.prepare('INSERT INTO download_log (bestand_id, gebruiker_id, ip) VALUES (?, ?, ?)').run(
      b.id, g.id, req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || null,
    )
  }

  return serveerBestand(req, absPad, { mime: b.mime, naam: b.originele_naam, alsBijlage: true })
}
