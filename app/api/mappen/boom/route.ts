import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Platte lijst van alle mappen van een gebruiker, met volledig pad — handig voor
// een "verplaats naar…"-keuzelijst. Beheerder mag ?eigenaar=<id> opgeven om de
// mappen van een andere gebruiker te kiezen (bestanden verplaatsen namens hen).
type MapRij = { id: number; naam: string; ouder_id: number | null; eigenaar_id: number }

export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const alle = req.nextUrl.searchParams.get('alle') === '1' && !!g.is_admin
  const param = req.nextUrl.searchParams.get('eigenaar')
  const eigenaarId = param && g.is_admin ? Number(param) : g.id

  const db = getDb()
  const rijen = (alle
    ? db.prepare('SELECT id, naam, ouder_id, eigenaar_id FROM map').all()
    : db.prepare('SELECT id, naam, ouder_id, eigenaar_id FROM map WHERE eigenaar_id = ?').all(eigenaarId)
  ) as MapRij[]
  const namen = Object.fromEntries((db.prepare('SELECT id, weergavenaam FROM gebruiker').all() as { id: number; weergavenaam: string }[]).map(u => [u.id, u.weergavenaam]))

  const opId = new Map(rijen.map(m => [m.id, m]))
  const pad = (m: MapRij): string => {
    const delen: string[] = []
    let cur: MapRij | undefined = m
    const zie = new Set<number>()
    while (cur && !zie.has(cur.id)) {
      zie.add(cur.id)
      delen.unshift(cur.naam)
      cur = cur.ouder_id != null ? opId.get(cur.ouder_id) : undefined
    }
    return delen.join(' / ')
  }

  const mappen = rijen
    .map(m => ({ id: m.id, naam: m.naam, pad: pad(m), eigenaar_id: m.eigenaar_id, eigenaar_naam: namen[m.eigenaar_id] || '?' }))
    .sort((a, b) => (a.eigenaar_naam + a.pad).localeCompare(b.eigenaar_naam + b.pad, 'nl'))
  return NextResponse.json({ mappen, alle })
}
