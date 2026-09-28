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

// Bestand(en) verplaatsen naar een (andere) map. map_id = null → hoofdmap.
// Eén bestand via { id } of meerdere via { ids: [...] }.
// Beheerder mag naar de map van een ANDERE eigenaar verplaatsen; het bestand
// komt dan onder die eigenaar (en verhuist fysiek naar diens opslag), zodat het
// netjes in die map zichtbaar blijft.
export async function PATCH(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const body = await req.json()
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : (body.id != null ? [Number(body.id)] : [])
  if (ids.length === 0) return NextResponse.json({ error: 'Geen bestanden' }, { status: 400 })
  const doelMap = body.map_id != null ? Number(body.map_id) : null
  const db = getDb()

  // Bepaal de doel-eigenaar aan de hand van de doelmap.
  let doelEigenaar: number | null = null
  if (doelMap != null) {
    const m = db.prepare('SELECT eigenaar_id FROM map WHERE id = ?').get(doelMap) as { eigenaar_id: number } | undefined
    if (!m) return NextResponse.json({ error: 'Doelmap niet gevonden' }, { status: 400 })
    doelEigenaar = m.eigenaar_id
    // Niet-beheerder mag alleen naar een EIGEN map verplaatsen.
    if (!g.is_admin && doelEigenaar !== g.id) return NextResponse.json({ error: 'Geen toegang tot deze map' }, { status: 403 })
  }

  let verplaatst = 0
  for (const id of ids) {
    const b = db.prepare('SELECT eigenaar_id, opgeslagen_naam FROM bestand WHERE id = ?').get(id) as
      { eigenaar_id: number; opgeslagen_naam: string } | undefined
    if (!b) continue
    if (b.eigenaar_id !== g.id && !g.is_admin) continue

    if (doelMap != null && doelEigenaar != null && doelEigenaar !== b.eigenaar_id) {
      // Andere eigenaar → bestand fysiek verhuizen en eigenaarschap overzetten.
      const veilig = path.basename(b.opgeslagen_naam)
      const oudPad = path.join(BESTAND_DIR, String(b.eigenaar_id), veilig)
      const nieuweMap = path.join(BESTAND_DIR, String(doelEigenaar))
      try {
        fs.mkdirSync(nieuweMap, { recursive: true })
        const nieuwPad = path.join(nieuweMap, veilig)
        try { fs.renameSync(oudPad, nieuwPad) } catch { fs.copyFileSync(oudPad, nieuwPad); try { fs.unlinkSync(oudPad) } catch { /* nvt */ } }
      } catch { /* bestand ontbreekt op schijf — metadata toch bijwerken */ }
      db.prepare('UPDATE bestand SET map_id = ?, eigenaar_id = ? WHERE id = ?').run(doelMap, doelEigenaar, id)
    } else {
      db.prepare('UPDATE bestand SET map_id = ? WHERE id = ?').run(doelMap, id)
    }
    verplaatst++
  }
  return NextResponse.json({ ok: true, verplaatst })
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
