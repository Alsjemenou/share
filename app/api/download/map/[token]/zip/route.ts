import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import archiver from 'archiver'
import { getDb, BESTAND_DIR, opslagBeschikbaar } from '@/lib/db'

export const runtime = 'nodejs'

const OPSLAG_OFFLINE = { error: 'Bestandsopslag is tijdelijk niet beschikbaar (netwerkschijf niet gekoppeld). Probeer het later opnieuw.' }

type BestandRij = { id: number; eigenaar_id: number; opgeslagen_naam: string; originele_naam: string }

// Alle bestanden onder een map (recursief) met hun relatieve pad in de zip.
function bestandenInMap(mapId: number, prefix: string): { rij: BestandRij; pad: string }[] {
  const db = getDb()
  const uit: { rij: BestandRij; pad: string }[] = []
  const files = db.prepare('SELECT id, eigenaar_id, opgeslagen_naam, originele_naam FROM bestand WHERE map_id = ?').all(mapId) as BestandRij[]
  for (const f of files) uit.push({ rij: f, pad: `${prefix}${f.originele_naam}` })
  const submappen = db.prepare('SELECT id, naam FROM map WHERE ouder_id = ?').all(mapId) as { id: number; naam: string }[]
  for (const s of submappen) uit.push(...bestandenInMap(s.id, `${prefix}${s.naam}/`))
  return uit
}

// Publieke download van een hele map als zip via een map-downloadlink (geen account).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!opslagBeschikbaar()) return NextResponse.json(OPSLAG_OFFLINE, { status: 503 })

  const db = getDb()
  const link = db.prepare(`
    SELECT dml.id, dml.map_id, dml.actief, m.naam
    FROM deel_map_link dml JOIN map m ON m.id = dml.map_id WHERE dml.token = ?
  `).get(token) as { id: number; map_id: number; actief: number; naam: string } | undefined
  if (!link) return NextResponse.json({ error: 'Deze link bestaat niet.' }, { status: 404 })
  if (!link.actief) return NextResponse.json({ error: 'Deze link is uitgeschakeld.' }, { status: 410 })

  const items = bestandenInMap(link.map_id, '')
  if (items.length === 0) return NextResponse.json({ error: 'Deze map is leeg.' }, { status: 404 })

  db.prepare('UPDATE deel_map_link SET download_count = download_count + 1 WHERE id = ?').run(link.id)

  const archive = archiver('zip', { zlib: { level: 0 } })
  for (const { rij, pad } of items) {
    const veilig = path.basename(rij.opgeslagen_naam)
    const absPad = path.join(BESTAND_DIR, String(rij.eigenaar_id), veilig)
    if (fs.existsSync(absPad)) archive.file(absPad, { name: pad })
  }
  archive.finalize()

  const zipNaam = `${(link.naam || 'map').replace(/[^\w.\- ]+/g, '_')}.zip`
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
