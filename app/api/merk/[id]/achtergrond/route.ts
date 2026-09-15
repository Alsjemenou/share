import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, MERK_DIR } from '@/lib/db'

export const runtime = 'nodejs'

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

// Serveert de achtergrondafbeelding van een gebruiker (publiek). Alleen raster.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const rij = db.prepare('SELECT merk_achtergrond FROM gebruiker WHERE id = ?').get(Number(id)) as { merk_achtergrond: string | null } | undefined
  if (!rij?.merk_achtergrond) return NextResponse.json({ error: 'Geen achtergrond' }, { status: 404 })

  const veilig = path.basename(rij.merk_achtergrond)
  const absPad = path.join(MERK_DIR, String(Number(id)), veilig)
  if (!fs.existsSync(absPad)) return NextResponse.json({ error: 'Geen achtergrond' }, { status: 404 })

  const ext = veilig.split('.').pop() || ''
  const data = fs.readFileSync(absPad)
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'public, max-age=300',
    },
  })
}
