import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'

export const runtime = 'nodejs'

// Lichte lijst van actieve gebruikers (id + naam) om leden aan een groep toe te
// voegen. Alleen voor ingelogde gebruikers; toont geen wachtwoorden o.i.d.
export async function GET() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const db = getDb()
  const gebruikers = db.prepare(
    "SELECT id, weergavenaam, email FROM gebruiker WHERE status = 'actief' ORDER BY weergavenaam COLLATE NOCASE"
  ).all()
  return NextResponse.json({ gebruikers })
}
