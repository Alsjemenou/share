import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb, UPLOAD_TMP_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Ruimt verweesde upload-sessies (>24u) + hun .part-bestanden op.
function ruimOudeSessiesOp() {
  const db = getDb()
  const oud = db.prepare("SELECT upload_id, tmp_pad FROM upload_sessie WHERE created_at < datetime('now','-1 day')").all() as
    { upload_id: string; tmp_pad: string }[]
  for (const s of oud) {
    try { fs.unlinkSync(s.tmp_pad) } catch { /* al weg */ }
    db.prepare('DELETE FROM upload_sessie WHERE upload_id = ?').run(s.upload_id)
  }
}

// Start een (hervatbare) upload. Maakt een lege .part en een sessie-rij aan.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  ruimOudeSessiesOp()

  const { naam, grootte, mime, map_id } = await req.json()
  const totaal = Number(grootte)
  if (!naam || !Number.isFinite(totaal) || totaal < 0) {
    return NextResponse.json({ error: 'Ongeldige upload-gegevens' }, { status: 400 })
  }

  const db = getDb()

  // Optioneel: in welke (eigen) map komt het bestand?
  let mapId: number | null = null
  if (map_id != null) {
    mapId = Number(map_id)
    if (!db.prepare('SELECT 1 FROM map WHERE id = ? AND eigenaar_id = ?').get(mapId, g.id)) {
      return NextResponse.json({ error: 'Doelmap niet gevonden' }, { status: 400 })
    }
  }

  const uploadId = crypto.randomUUID()
  const tmpPad = path.join(UPLOAD_TMP_DIR, `${uploadId}.part`)
  fs.writeFileSync(tmpPad, Buffer.alloc(0))

  db.prepare(`
    INSERT INTO upload_sessie (upload_id, eigenaar_id, originele_naam, mime, grootte, ontvangen_bytes, tmp_pad, map_id)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(uploadId, g.id, String(naam), String(mime || 'application/octet-stream'), totaal, tmpPad, mapId)

  return NextResponse.json({ upload_id: uploadId, ontvangen: 0 })
}
