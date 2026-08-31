import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magMapZien } from '@/lib/deel'

export const runtime = 'nodejs'

// "Gedeeld met mij" als browser: gedeelde mappen (bladerbaar) + losse gedeelde bestanden.
// Delen van een map geeft toegang tot de hele (sub)boom (ook later toegevoegd).
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const db = getDb()
  const mapParam = req.nextUrl.searchParams.get('map')

  const mapCounts = (id: number) => ({
    aantal_submappen: (db.prepare('SELECT COUNT(*) n FROM map WHERE ouder_id = ?').get(id) as { n: number }).n,
    aantal_bestanden: (db.prepare('SELECT COUNT(*) n FROM bestand WHERE map_id = ?').get(id) as { n: number }).n,
  })

  // ── In een gedeelde map bladeren ──────────────────────────────────────────
  if (mapParam) {
    const mapId = Number(mapParam)
    if (!magMapZien(g, mapId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    // Breadcrumb: omhoog zolang de map zichtbaar blijft (stopt bij de gedeelde wortel).
    const kruimels: { id: number; naam: string }[] = []
    let cur: number | null = mapId
    const zie = new Set<number>()
    while (cur != null && !zie.has(cur) && magMapZien(g, cur)) {
      zie.add(cur)
      const m = db.prepare('SELECT id, naam, ouder_id FROM map WHERE id = ?').get(cur) as
        | { id: number; naam: string; ouder_id: number | null } | undefined
      if (!m) break
      kruimels.unshift({ id: m.id, naam: m.naam })
      cur = m.ouder_id
    }

    const mappen = (db.prepare('SELECT id, naam FROM map WHERE ouder_id = ? ORDER BY naam COLLATE NOCASE').all(mapId) as
      { id: number; naam: string }[]).map(m => ({ ...m, ...mapCounts(m.id) }))
    const bestanden = db.prepare(`
      SELECT b.id, b.originele_naam, b.mime, b.grootte, b.created_at, e.weergavenaam AS eigenaar_naam
      FROM bestand b JOIN gebruiker e ON e.id = b.eigenaar_id
      WHERE b.map_id = ? ORDER BY b.created_at DESC
    `).all(mapId)
    return NextResponse.json({ huidige_map: mapId, kruimels, mappen, bestanden })
  }

  // ── Wortel: toppen van gedeelde mapbomen + losse gedeelde bestanden ────────
  const gedeeldeMappen = db.prepare(`
    SELECT DISTINCT m.id, m.naam, m.ouder_id, e.weergavenaam AS eigenaar_naam
    FROM deel_map dm JOIN map m ON m.id = dm.map_id JOIN gebruiker e ON e.id = m.eigenaar_id
    WHERE (dm.ontvanger_type = 'account' AND dm.ontvanger_id = @u)
       OR (dm.ontvanger_type = 'groep' AND dm.ontvanger_id IN (SELECT groep_id FROM groep_lid WHERE gebruiker_id = @u))
  `).all({ u: g.id }) as { id: number; naam: string; ouder_id: number | null; eigenaar_naam: string }[]

  // Alleen de top van elke gedeelde boom tonen (ouder niet ook al zichtbaar).
  const mappen = gedeeldeMappen
    .filter(m => m.ouder_id == null || !magMapZien(g, m.ouder_id))
    .map(m => ({ id: m.id, naam: m.naam, eigenaar_naam: m.eigenaar_naam, ...mapCounts(m.id) }))

  const losseBestanden = db.prepare(`
    SELECT DISTINCT b.id, b.originele_naam, b.mime, b.grootte, b.created_at, b.map_id, e.weergavenaam AS eigenaar_naam
    FROM bestand b JOIN gebruiker e ON e.id = b.eigenaar_id
    WHERE b.id IN (
      SELECT bestand_id FROM deel_account WHERE gebruiker_id = @u
      UNION
      SELECT dg.bestand_id FROM deel_groep dg JOIN groep_lid gl ON gl.groep_id = dg.groep_id WHERE gl.gebruiker_id = @u
    )
    ORDER BY b.created_at DESC
  `).all({ u: g.id }) as { id: number; map_id: number | null; [k: string]: unknown }[]

  // Verberg bestanden die je al via een gedeelde map kunt bladeren (voorkomt dubbel).
  const bestanden = losseBestanden.filter(b => b.map_id == null || !magMapZien(g, b.map_id))

  return NextResponse.json({ huidige_map: null, kruimels: [], mappen, bestanden })
}
