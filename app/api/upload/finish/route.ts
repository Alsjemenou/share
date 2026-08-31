import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Rondt een upload af: valideert de grootte, verplaatst het .part-bestand naar
// de privémap van de eigenaar en legt het bestand vast in de database.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const id = req.nextUrl.searchParams.get('id')
  const db = getDb()
  const s = db.prepare('SELECT * FROM upload_sessie WHERE upload_id = ? AND eigenaar_id = ?').get(id, g.id) as
    | { upload_id: string; originele_naam: string; mime: string; grootte: number; tmp_pad: string; map_id: number | null }
    | undefined
  if (!s) return NextResponse.json({ error: 'Upload niet gevonden' }, { status: 404 })

  let opSchijf = 0
  try { opSchijf = fs.statSync(s.tmp_pad).size } catch { opSchijf = 0 }
  if (opSchijf !== s.grootte) {
    return NextResponse.json({ error: 'Upload is niet compleet', ontvangen: opSchijf, grootte: s.grootte }, { status: 400 })
  }

  // Doelmap = data/bestanden/<eigenaar_id>/, opslagnaam = uuid + originele extensie.
  const map = path.join(BESTAND_DIR, String(g.id))
  fs.mkdirSync(map, { recursive: true })
  const ext = path.extname(s.originele_naam).slice(0, 20)
  const opgeslagenNaam = `${crypto.randomUUID()}${ext}`
  const doel = path.join(map, opgeslagenNaam)

  try {
    fs.renameSync(s.tmp_pad, doel)
  } catch {
    // Fallback als rename over volumes niet lukt: kopieer + verwijder.
    fs.copyFileSync(s.tmp_pad, doel)
    try { fs.unlinkSync(s.tmp_pad) } catch { /* nvt */ }
  }

  // Map nog geldig? (kan verwijderd zijn tijdens de upload) → anders hoofdmap.
  const mapId = s.map_id != null && db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(s.map_id, g.id)
    ? s.map_id : null

  const r = db.prepare(`
    INSERT INTO bestand (eigenaar_id, opgeslagen_naam, originele_naam, mime, grootte, map_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(g.id, opgeslagenNaam, s.originele_naam, s.mime, s.grootte, mapId)

  db.prepare('DELETE FROM upload_sessie WHERE upload_id = ?').run(s.upload_id)

  return NextResponse.json({ bestand_id: Number(r.lastInsertRowid) })
}
