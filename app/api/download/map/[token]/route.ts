import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { haalMerk } from '@/lib/merk'

export const runtime = 'nodejs'

type MapLink = { id: number; map_id: number; actief: number; aangemaakt_door: number | null; naam: string }

function haalMapLink(token: string): MapLink | undefined {
  const db = getDb()
  return db.prepare(`
    SELECT dml.id, dml.map_id, dml.actief, dml.aangemaakt_door, m.naam
    FROM deel_map_link dml JOIN map m ON m.id = dml.map_id
    WHERE dml.token = ?
  `).get(token) as MapLink | undefined
}

// Aantal bestanden in een map (recursief).
function aantalBestanden(mapId: number): number {
  const db = getDb()
  const direct = (db.prepare('SELECT COUNT(*) n FROM bestand WHERE map_id = ?').get(mapId) as { n: number }).n
  const subs = db.prepare('SELECT id FROM map WHERE ouder_id = ?').all(mapId) as { id: number }[]
  return subs.reduce((s, sub) => s + aantalBestanden(sub.id), direct)
}

// Publieke metadata over een map-downloadlink.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = haalMapLink(token)
  if (!link) return NextResponse.json({ error: 'Deze link bestaat niet.' }, { status: 404 })
  const reden = link.actief ? null : 'Deze link is uitgeschakeld.'
  return NextResponse.json({
    naam: link.naam,
    aantal_bestanden: aantalBestanden(link.map_id),
    reden,
    merk: link.aangemaakt_door ? haalMerk(link.aangemaakt_door) : null,
  })
}
