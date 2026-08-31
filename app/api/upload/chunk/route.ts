import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Ontvangt één stuk (rauwe binaire body) en voegt het toe aan het .part-bestand.
// De client stuurt ?id=<upload_id>&offset=<bytepositie>. Bij mismatch geven we
// 409 met de werkelijke stand terug, zodat de client kan hervatten.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const id = req.nextUrl.searchParams.get('id')
  const offset = Number(req.nextUrl.searchParams.get('offset'))
  const db = getDb()
  const s = db.prepare('SELECT * FROM upload_sessie WHERE upload_id = ? AND eigenaar_id = ?').get(id, g.id) as
    | { upload_id: string; grootte: number; ontvangen_bytes: number; tmp_pad: string }
    | undefined
  if (!s) return NextResponse.json({ error: 'Upload niet gevonden' }, { status: 404 })

  // Werkelijke grootte op schijf is de bron van waarheid.
  let huidig = 0
  try { huidig = fs.statSync(s.tmp_pad).size } catch { huidig = 0 }

  if (!Number.isFinite(offset) || offset !== huidig) {
    return NextResponse.json({ error: 'Offset klopt niet', ontvangen: huidig }, { status: 409 })
  }

  const chunk = Buffer.from(await req.arrayBuffer())
  if (chunk.length === 0) {
    return NextResponse.json({ ontvangen: huidig })
  }
  if (huidig + chunk.length > s.grootte) {
    return NextResponse.json({ error: 'Upload overschrijdt de opgegeven grootte' }, { status: 400 })
  }

  fs.appendFileSync(s.tmp_pad, chunk)
  const ontvangen = huidig + chunk.length
  db.prepare('UPDATE upload_sessie SET ontvangen_bytes = ? WHERE upload_id = ?').run(ontvangen, s.upload_id)

  return NextResponse.json({ ontvangen })
}
