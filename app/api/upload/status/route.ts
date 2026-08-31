import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Hoeveel bytes zijn er al ontvangen? Gebruikt door de client om te hervatten.
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const id = req.nextUrl.searchParams.get('id')
  const db = getDb()
  const s = db.prepare('SELECT ontvangen_bytes, grootte FROM upload_sessie WHERE upload_id = ? AND eigenaar_id = ?')
    .get(id, g.id) as { ontvangen_bytes: number; grootte: number } | undefined
  if (!s) return NextResponse.json({ error: 'Upload niet gevonden' }, { status: 404 })

  return NextResponse.json({ ontvangen: s.ontvangen_bytes, grootte: s.grootte })
}
