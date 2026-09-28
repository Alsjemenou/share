import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Platte lijst van alle mappen van een gebruiker, met volledig pad — handig voor
// een "verplaats naar…"-keuzelijst. Beheerder mag ?eigenaar=<id> opgeven om de
// mappen van een andere gebruiker te kiezen (bestanden verplaatsen namens hen).
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const param = req.nextUrl.searchParams.get('eigenaar')
  const eigenaarId = param && g.is_admin ? Number(param) : g.id

  const db = getDb()
  const rijen = db.prepare('SELECT id, naam, ouder_id FROM map WHERE eigenaar_id = ?').all(eigenaarId) as
    { id: number; naam: string; ouder_id: number | null }[]

  const opId = new Map(rijen.map(m => [m.id, m]))
  const pad = (m: { id: number; naam: string; ouder_id: number | null }): string => {
    const delen: string[] = []
    let cur: { id: number; naam: string; ouder_id: number | null } | undefined = m
    const zie = new Set<number>()
    while (cur && !zie.has(cur.id)) {
      zie.add(cur.id)
      delen.unshift(cur.naam)
      cur = cur.ouder_id != null ? opId.get(cur.ouder_id) : undefined
    }
    return delen.join(' / ')
  }

  const mappen = rijen
    .map(m => ({ id: m.id, naam: m.naam, pad: pad(m) }))
    .sort((a, b) => a.pad.localeCompare(b.pad, 'nl'))
  return NextResponse.json({ mappen })
}
