import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Bestanden die met de ingelogde gebruiker gedeeld zijn (naar zijn/haar account).
export async function GET() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const db = getDb()
  const rijen = db.prepare(`
    SELECT b.id, b.originele_naam, b.mime, b.grootte, b.created_at,
           da.created_at AS gedeeld_op, e.weergavenaam AS eigenaar_naam
    FROM deel_account da
    JOIN bestand b ON b.id = da.bestand_id
    JOIN gebruiker e ON e.id = b.eigenaar_id
    WHERE da.gebruiker_id = ?
    ORDER BY da.created_at DESC
  `).all(g.id)

  return NextResponse.json({ bestanden: rijen })
}
