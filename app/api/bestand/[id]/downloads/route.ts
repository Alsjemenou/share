import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'

export const runtime = 'nodejs'

function magBeheren(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
}

// Downloadgeschiedenis van een bestand (tracking). Eigenaar of beheerder.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await params
  if (!magBeheren(g, Number(id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const db = getDb()
  const logs = db.prepare(`
    SELECT lg.tijd, lg.ip, lg.deel_link_id,
           CASE WHEN lg.gebruiker_id IS NOT NULL THEN u.weergavenaam ELSE NULL END AS gebruiker_naam
    FROM download_log lg
    LEFT JOIN gebruiker u ON u.id = lg.gebruiker_id
    WHERE lg.bestand_id = ?
    ORDER BY lg.tijd DESC LIMIT 100
  `).all(Number(id))
  const totaal = (db.prepare('SELECT COUNT(*) n FROM download_log WHERE bestand_id = ?').get(Number(id)) as { n: number }).n
  return NextResponse.json({ logs, totaal })
}
