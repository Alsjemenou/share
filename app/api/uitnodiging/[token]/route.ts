import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashWachtwoord, maakToken, zetSessieCookie } from '@/lib/auth'

export const runtime = 'nodejs'

type Uitgenodigd = { id: number; gebruikersnaam: string; weergavenaam: string; email: string | null }

function haalUitnodiging(token: string): Uitgenodigd | undefined {
  const db = getDb()
  return db.prepare(
    "SELECT id, gebruikersnaam, weergavenaam, email FROM gebruiker WHERE invite_token = ? AND status = 'uitgenodigd'"
  ).get(token) as Uitgenodigd | undefined
}

// Info over een uitnodiging (voor de accepteer-pagina).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const u = haalUitnodiging(token)
  if (!u) return NextResponse.json({ error: 'Deze uitnodiging is ongeldig of al gebruikt.' }, { status: 404 })

  const db = getDb()
  const aantal = (db.prepare('SELECT COUNT(*) n FROM deel_account WHERE gebruiker_id = ?').get(u.id) as { n: number }).n
  return NextResponse.json({ gebruikersnaam: u.gebruikersnaam, weergavenaam: u.weergavenaam, aantal_bestanden: aantal })
}

// Uitnodiging accepteren: wachtwoord instellen, account activeren, inloggen.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const u = haalUitnodiging(token)
  if (!u) return NextResponse.json({ error: 'Deze uitnodiging is ongeldig of al gebruikt.' }, { status: 404 })

  const { wachtwoord, weergavenaam } = await req.json()
  if (!wachtwoord || String(wachtwoord).length < 6) {
    return NextResponse.json({ error: 'Kies een wachtwoord van minstens 6 tekens' }, { status: 400 })
  }

  const db = getDb()
  db.prepare(`
    UPDATE gebruiker
    SET wachtwoord_hash = ?, status = 'actief', invite_token = NULL, weergavenaam = ?
    WHERE id = ?
  `).run(
    hashWachtwoord(String(wachtwoord)),
    weergavenaam && String(weergavenaam).trim() ? String(weergavenaam).trim() : u.weergavenaam,
    u.id,
  )

  const res = NextResponse.json({ ok: true })
  zetSessieCookie(res, maakToken(u.id))
  return res
}
