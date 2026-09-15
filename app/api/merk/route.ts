import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { haalMerk, geldigeKleur } from '@/lib/merk'

export const runtime = 'nodejs'

// Eigen huisstijl ophalen.
export async function GET() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  return NextResponse.json({ merk: haalMerk(g.id) })
}

// Eigen huisstijl bijwerken (naam, tagline, accentkleur). Logo gaat via /api/merk/logo.
export async function PUT(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { naam, subtitel, kleur } = await req.json()
  const db = getDb()

  const naamW = naam != null ? String(naam).trim().slice(0, 60) || null : null
  const subW = subtitel != null ? String(subtitel).trim().slice(0, 80) || null : null
  const kleurW = kleur != null && String(kleur).trim() ? geldigeKleur(kleur) : null
  if (kleur != null && String(kleur).trim() && !kleurW) {
    return NextResponse.json({ error: 'Ongeldige kleur (gebruik #rrggbb)' }, { status: 400 })
  }

  db.prepare('UPDATE gebruiker SET merk_naam = ?, merk_subtitel = ?, merk_kleur = ? WHERE id = ?')
    .run(naamW, subW, kleurW, g.id)
  return NextResponse.json({ merk: haalMerk(g.id) })
}
