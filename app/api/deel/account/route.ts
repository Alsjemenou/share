import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'
import { maakDeelToken } from '@/lib/deel'

export const runtime = 'nodejs'

function magBeheren(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// Lijst accounts waarmee een bestand gedeeld is.
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const bestandId = Number(req.nextUrl.searchParams.get('bestand'))
  if (!magBeheren(g, bestandId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const db = getDb()
  const accounts = db.prepare(`
    SELECT da.id, da.created_at, u.id AS gebruiker_id, u.weergavenaam, u.email, u.status, u.invite_token
    FROM deel_account da JOIN gebruiker u ON u.id = da.gebruiker_id
    WHERE da.bestand_id = ? ORDER BY da.created_at DESC
  `).all(bestandId)
  return NextResponse.json({ accounts })
}

// Deel een bestand met een persoon (op naam of e-mail).
// Bestaat er nog geen account, dan wordt een 'uitgenodigd' account + invite-link
// aangemaakt die de deler zelf doorstuurt (geen e-mailserver nodig).
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { bestand_id, ontvanger } = await req.json()
  if (!magBeheren(g, Number(bestand_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const invoer = String(ontvanger || '').trim()
  if (!invoer) return NextResponse.json({ error: 'Vul een naam of e-mailadres in' }, { status: 400 })

  const db = getDb()
  const email = isEmail(invoer) ? invoer : null

  // Bestaand account zoeken op e-mail of gebruikersnaam.
  let account = db.prepare(
    'SELECT id, weergavenaam, email, status, invite_token FROM gebruiker WHERE email = ? OR gebruikersnaam = ?'
  ).get(email, invoer) as
    | { id: number; weergavenaam: string; email: string | null; status: string; invite_token: string | null }
    | undefined

  let nieuweUitnodiging = false
  if (!account) {
    // Nieuw 'uitgenodigd' account aanmaken (nog geen wachtwoord).
    let gebruikersnaam = email || invoer
    // Zorg voor een unieke gebruikersnaam.
    if (db.prepare('SELECT 1 FROM gebruiker WHERE gebruikersnaam = ?').get(gebruikersnaam)) {
      gebruikersnaam = `${gebruikersnaam}-${maakDeelToken(3)}`
    }
    const token = maakDeelToken()
    const r = db.prepare(`
      INSERT INTO gebruiker (gebruikersnaam, weergavenaam, email, is_admin, status, invite_token)
      VALUES (?, ?, ?, 0, 'uitgenodigd', ?)
    `).run(gebruikersnaam, invoer, email, token)
    account = { id: Number(r.lastInsertRowid), weergavenaam: invoer, email, status: 'uitgenodigd', invite_token: token }
    nieuweUitnodiging = true
  }

  // Koppeling leggen (idempotent).
  db.prepare(`
    INSERT OR IGNORE INTO deel_account (bestand_id, gebruiker_id, gedeeld_door) VALUES (?, ?, ?)
  `).run(Number(bestand_id), account.id, g.id)

  // Uitnodigingslink meegeven als het account nog niet actief is.
  const uitnodiging = account.status !== 'actief' && account.invite_token
    ? { token: account.invite_token, nieuw: nieuweUitnodiging }
    : null

  return NextResponse.json({
    ok: true,
    account: { id: account.id, weergavenaam: account.weergavenaam, email: account.email, status: account.status },
    uitnodiging,
  })
}

// Deling met een account intrekken.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const rij = db.prepare('SELECT bestand_id FROM deel_account WHERE id = ?').get(id) as { bestand_id: number } | undefined
  if (!rij || !magBeheren(g, rij.bestand_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM deel_account WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
