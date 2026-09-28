import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import archiver from 'archiver'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'
import { magBestandZien, magMapZien } from '@/lib/deel'

export const runtime = 'nodejs'

type BestandRij = { id: number; eigenaar_id: number; opgeslagen_naam: string; originele_naam: string }

// Verzamelt alle bestanden onder een map (recursief) met hun relatieve pad.
function bestandenInMap(mapId: number, prefix: string): { rij: BestandRij; pad: string }[] {
  const db = getDb()
  const uit: { rij: BestandRij; pad: string }[] = []
  const files = db.prepare('SELECT id, eigenaar_id, opgeslagen_naam, originele_naam FROM bestand WHERE map_id = ?').all(mapId) as BestandRij[]
  for (const f of files) uit.push({ rij: f, pad: `${prefix}${f.originele_naam}` })
  const submappen = db.prepare('SELECT id, naam FROM map WHERE ouder_id = ?').all(mapId) as { id: number; naam: string }[]
  for (const s of submappen) uit.push(...bestandenInMap(s.id, `${prefix}${s.naam}/`))
  return uit
}

// Downloadt meerdere bestanden als één zip. Kies bestanden via ?ids=1,2,3 óf een
// hele (sub)map via ?map=<id>. Streamt de zip (geen alles-in-geheugen).
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const db = getDb()
  let items: { rij: BestandRij; pad: string }[] = []
  let zipNaam = 'bestanden.zip'

  const mapParam = req.nextUrl.searchParams.get('map')
  if (mapParam) {
    const mapId = Number(mapParam)
    if (!magMapZien(g, mapId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const m = db.prepare('SELECT naam FROM map WHERE id = ?').get(mapId) as { naam: string } | undefined
    zipNaam = `${(m?.naam || 'map').replace(/[^\w.\- ]+/g, '_')}.zip`
    items = bestandenInMap(mapId, '')
  } else {
    const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
    if (ids.length === 0) return NextResponse.json({ error: 'Geen bestanden gekozen' }, { status: 400 })
    const gezien = new Set<string>()
    for (const id of ids.slice(0, 500)) {
      if (!magBestandZien(g as Gebruiker, id)) continue
      const rij = db.prepare('SELECT id, eigenaar_id, opgeslagen_naam, originele_naam FROM bestand WHERE id = ?').get(id) as BestandRij | undefined
      if (!rij) continue
      // Naamconflicten binnen de zip voorkomen.
      let naam = rij.originele_naam
      let n = 2
      while (gezien.has(naam.toLowerCase())) {
        const ext = path.extname(rij.originele_naam)
        naam = `${rij.originele_naam.slice(0, rij.originele_naam.length - ext.length)} (${n})${ext}`
        n++
      }
      gezien.add(naam.toLowerCase())
      items.push({ rij, pad: naam })
    }
  }

  if (items.length === 0) return NextResponse.json({ error: 'Geen toegankelijke bestanden' }, { status: 404 })

  const archive = archiver('zip', { zlib: { level: 0 } }) // level 0: media is toch al gecomprimeerd → snel, geen CPU-verspilling
  for (const { rij, pad } of items) {
    const veilig = path.basename(rij.opgeslagen_naam)
    const absPad = path.join(BESTAND_DIR, String(rij.eigenaar_id), veilig)
    if (fs.existsSync(absPad)) archive.file(absPad, { name: pad })
  }
  archive.finalize()

  const naamAscii = zipNaam.replace(/[^\x20-\x7E]/g, '_')
  const web = Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream
  return new NextResponse(web, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${naamAscii}"; filename*=UTF-8''${encodeURIComponent(zipNaam)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
