import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { checkWachtwoord, maakToken, zetSessieCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { gebruikersnaam, wachtwoord } = await req.json()
  const db = getDb()
  const g = db.prepare("SELECT * FROM gebruiker WHERE gebruikersnaam = ? AND status = 'actief'").get(
    String(gebruikersnaam || '').trim()
  ) as { id: number; wachtwoord_hash: string | null } | undefined

  // Zelfde melding bij onbekende gebruiker of fout wachtwoord (geen info lekken).
  if (!g || !checkWachtwoord(String(wachtwoord || ''), g.wachtwoord_hash)) {
    return NextResponse.json({ error: 'Onjuiste gebruikersnaam of wachtwoord' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  zetSessieCookie(res, maakToken(g.id))
  return res
}
