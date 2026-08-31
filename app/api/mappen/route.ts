import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magMapBeheren } from '@/lib/deel'

export const runtime = 'nodejs'

type MapRij = { id: number; naam: string; ouder_id: number | null; eigenaar_id: number }

// Breadcrumb: van hoofdmap naar de huidige map (alleen eigen mappen).
function kruimels(uid: number, mapId: number | null): { id: number; naam: string }[] {
  const db = getDb()
  const pad: { id: number; naam: string }[] = []
  let cur = mapId
  const zie = new Set<number>()
  while (cur != null && !zie.has(cur)) {
    zie.add(cur)
    const m = db.prepare('SELECT id, naam, ouder_id FROM map WHERE id = ? AND eigenaar_id = ?').get(cur, uid) as
      | { id: number; naam: string; ouder_id: number | null } | undefined
    if (!m) break
    pad.unshift({ id: m.id, naam: m.naam })
    cur = m.ouder_id
  }
  return pad
}

// Mappenbrowser voor de eigen bestanden: submappen + bestanden in de huidige map.
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const mapParam = req.nextUrl.searchParams.get('map')
  const mapId = mapParam ? Number(mapParam) : null
  const db = getDb()

  // Verifieer eigendom van de huidige map (indien opgegeven).
  if (mapId != null) {
    const eigen = db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(mapId, g.id)
    if (!eigen) return NextResponse.json({ error: 'Map niet gevonden' }, { status: 404 })
  }

  const mappen = db.prepare(`
    SELECT m.id, m.naam,
           (SELECT COUNT(*) FROM map s WHERE s.ouder_id = m.id) AS aantal_submappen,
           (SELECT COUNT(*) FROM bestand b WHERE b.map_id = m.id) AS aantal_bestanden
    FROM map m
    WHERE m.eigenaar_id = @uid AND ${mapId == null ? 'm.ouder_id IS NULL' : 'm.ouder_id = @map'}
    ORDER BY m.naam COLLATE NOCASE
  `).all({ uid: g.id, map: mapId })

  const bestanden = db.prepare(`
    SELECT b.id, b.originele_naam, b.mime, b.grootte, b.created_at,
           (SELECT COUNT(*) FROM deel_link dl WHERE dl.bestand_id = b.id AND dl.actief = 1) AS aantal_links,
           (SELECT COUNT(*) FROM deel_account da WHERE da.bestand_id = b.id) AS aantal_accounts,
           (SELECT COUNT(*) FROM deel_groep dg WHERE dg.bestand_id = b.id) AS aantal_groepen,
           (SELECT COUNT(*) FROM download_log lg WHERE lg.bestand_id = b.id) AS downloads
    FROM bestand b
    WHERE b.eigenaar_id = @uid AND ${mapId == null ? 'b.map_id IS NULL' : 'b.map_id = @map'}
    ORDER BY b.created_at DESC
  `).all({ uid: g.id, map: mapId })

  return NextResponse.json({ huidige_map: mapId, kruimels: kruimels(g.id, mapId), mappen, bestanden })
}

// Nieuwe map aanmaken.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { naam, ouder_id } = await req.json()
  if (!naam || !String(naam).trim()) return NextResponse.json({ error: 'Geef de map een naam' }, { status: 400 })
  const db = getDb()
  const ouder = ouder_id != null ? Number(ouder_id) : null
  if (ouder != null && !db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(ouder, g.id)) {
    return NextResponse.json({ error: 'Oudermap niet gevonden' }, { status: 400 })
  }
  const r = db.prepare('INSERT INTO map (eigenaar_id, naam, ouder_id) VALUES (?, ?, ?)')
    .run(g.id, String(naam).trim(), ouder)
  return NextResponse.json({ id: Number(r.lastInsertRowid) })
}

// Map hernoemen en/of verplaatsen.
export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id, naam, ouder_id } = await req.json()
  const db = getDb()
  const m = db.prepare('SELECT * FROM map WHERE id = ?').get(id) as MapRij | undefined
  if (!m || !magMapBeheren(g, m.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (naam !== undefined && String(naam).trim()) {
    db.prepare('UPDATE map SET naam = ? WHERE id = ?').run(String(naam).trim(), m.id)
  }
  if (ouder_id !== undefined) {
    const nieuweOuder = ouder_id === null ? null : Number(ouder_id)
    if (nieuweOuder != null) {
      // Doelmap moet van dezelfde eigenaar zijn en mag niet de map zelf of een nakomeling zijn.
      const doel = db.prepare('SELECT eigenaar_id FROM map WHERE id = ?').get(nieuweOuder) as { eigenaar_id: number } | undefined
      if (!doel || doel.eigenaar_id !== m.eigenaar_id) {
        return NextResponse.json({ error: 'Ongeldige doelmap' }, { status: 400 })
      }
      // Nakomeling-check: loop van doel omhoog; kom je m tegen, dan is het circulair.
      let cur: number | null = nieuweOuder
      const zie = new Set<number>()
      while (cur != null && !zie.has(cur)) {
        if (cur === m.id) return NextResponse.json({ error: 'Kan een map niet in zichzelf plaatsen' }, { status: 400 })
        zie.add(cur)
        cur = (db.prepare('SELECT ouder_id FROM map WHERE id = ?').get(cur) as { ouder_id: number | null } | undefined)?.ouder_id ?? null
      }
    }
    db.prepare('UPDATE map SET ouder_id = ? WHERE id = ?').run(nieuweOuder, m.id)
  }
  return NextResponse.json({ ok: true })
}

// Map verwijderen (submappen cascaden; bestanden gaan terug naar de hoofdmap).
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const m = db.prepare('SELECT id FROM map WHERE id = ?').get(id) as { id: number } | undefined
  if (!m || !magMapBeheren(g, m.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM map WHERE id = ?').run(m.id) // submappen cascaden; bestand.map_id -> NULL
  return NextResponse.json({ ok: true })
}
