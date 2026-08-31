import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashWachtwoord, maakToken, zetSessieCookie, aantalGebruikers } from '@/lib/auth'

// Eenmalig: maakt het eerste account aan (beheerder/super). Werkt alleen als er nog
// geen actieve gebruikers zijn — daarna is open registratie gesloten (privacy).
export async function POST(req: NextRequest) {
  if (aantalGebruikers() > 0) {
    return NextResponse.json({ error: 'Er bestaat al een account' }, { status: 403 })
  }
  const { gebruikersnaam, weergavenaam, wachtwoord } = await req.json()
  if (!gebruikersnaam || !wachtwoord || String(wachtwoord).length < 6) {
    return NextResponse.json({ error: 'Vul een gebruikersnaam in en een wachtwoord van minstens 6 tekens' }, { status: 400 })
  }
  const db = getDb()
  const r = db.prepare(
    "INSERT INTO gebruiker (gebruikersnaam, weergavenaam, wachtwoord_hash, is_admin, status) VALUES (?, ?, ?, 1, 'actief')"
  ).run(
    String(gebruikersnaam).trim(),
    String(weergavenaam || gebruikersnaam).trim(),
    hashWachtwoord(String(wachtwoord))
  )
  const res = NextResponse.json({ ok: true })
  zetSessieCookie(res, maakToken(Number(r.lastInsertRowid)))
  return res
}
