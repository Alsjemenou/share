import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Lijst met bestanden. Standaard: alleen die van de ingelogde gebruiker.
// Beheerder kan met ?alle=1 alle bestanden opvragen (met eigenaar erbij).
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const alle = req.nextUrl.searchParams.get('alle') === '1' && !!g.is_admin
  const db = getDb()

  const rijen = db.prepare(`
    SELECT b.id, b.originele_naam, b.mime, b.grootte, b.created_at,
           b.eigenaar_id, e.weergavenaam AS eigenaar_naam,
           (SELECT COUNT(*) FROM deel_link dl WHERE dl.bestand_id = b.id AND dl.actief = 1) AS aantal_links,
           (SELECT COUNT(*) FROM deel_account da WHERE da.bestand_id = b.id) AS aantal_accounts,
           (SELECT COUNT(*) FROM download_log lg WHERE lg.bestand_id = b.id) AS downloads
    FROM bestand b
    JOIN gebruiker e ON e.id = b.eigenaar_id
    ${alle ? '' : 'WHERE b.eigenaar_id = @uid'}
    ORDER BY b.created_at DESC
  `).all(alle ? {} : { uid: g.id })

  return NextResponse.json({ bestanden: rijen, alle })
}

// Bestand verplaatsen naar een (andere) map. map_id = null → hoofdmap.
export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id, map_id } = await req.json()
  const db = getDb()
  const b = db.prepare('SELECT eigenaar_id FROM bestand WHERE id = ?').get(id) as { eigenaar_id: number } | undefined
  if (!b) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  if (b.eigenaar_id !== g.id && !g.is_admin) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const doelMap = map_id != null ? Number(map_id) : null
  if (doelMap != null && !db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(doelMap, b.eigenaar_id)) {
    return NextResponse.json({ error: 'Doelmap niet gevonden' }, { status: 400 })
  }
  db.prepare('UPDATE bestand SET map_id = ? WHERE id = ?').run(doelMap, id)
  return NextResponse.json({ ok: true })
}

// Bestand verwijderen (eigenaar of beheerder) — incl. bestand op schijf.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const { id } = await req.json()
  const db = getDb()
  const b = db.prepare('SELECT id, eigenaar_id, opgeslagen_naam FROM bestand WHERE id = ?').get(id) as
    | { id: number; eigenaar_id: number; opgeslagen_naam: string }
    | undefined
  if (!b) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  if (b.eigenaar_id !== g.id && !g.is_admin) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  db.prepare('DELETE FROM bestand WHERE id = ?').run(b.id) // links/deelaccounts cascaden mee
  try {
    const veilig = path.basename(b.opgeslagen_naam)
    fs.unlinkSync(path.join(BESTAND_DIR, String(b.eigenaar_id), veilig))
  } catch { /* al weg */ }

  return NextResponse.json({ ok: true })
}
