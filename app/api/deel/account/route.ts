import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'
import { maakDeelToken } from '@/lib/deel'
import { mailDeelMelding, mailUitnodiging, mailPubliekeLink, appUrl, type MailResultaat } from '@/lib/mail'

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

// Deel een bestand met een persoon.
// - Bestaat er al een account (op naam of e-mail) → delen onder "Gedeeld met mij".
// - Een e-mailadres ZONDER account → unieke publieke downloadlink + mailen (geen account).
// - Een naam zonder account → vriendelijke fout (vraag om een e-mailadres).
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { bestand_id, ontvanger, bericht, uitnodigen } = await req.json()
  if (!magBeheren(g, Number(bestand_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const invoer = String(ontvanger || '').trim()
  if (!invoer) return NextResponse.json({ error: 'Vul een naam of e-mailadres in' }, { status: 400 })

  const db = getDb()
  const email = isEmail(invoer) ? invoer : null
  const b = db.prepare('SELECT originele_naam FROM bestand WHERE id = ?').get(Number(bestand_id)) as { originele_naam: string } | undefined
  const bestandNaam = b?.originele_naam || 'een bestand'

  // Bestaand account zoeken op e-mail of gebruikersnaam.
  const account = db.prepare(
    'SELECT id, weergavenaam, email, status FROM gebruiker WHERE email = ? COLLATE NOCASE OR gebruikersnaam = ?'
  ).get(email, invoer) as
    | { id: number; weergavenaam: string; email: string | null; status: string }
    | undefined

  // ── Bestaand account → delen onder "Gedeeld met mij" ────────────────────────
  if (account) {
    db.prepare('INSERT OR IGNORE INTO deel_account (bestand_id, gebruiker_id, gedeeld_door) VALUES (?, ?, ?)')
      .run(Number(bestand_id), account.id, g.id)
    let mail: MailResultaat | undefined
    if (account.email) mail = await mailDeelMelding(account.email, g.weergavenaam, bestandNaam)
    return NextResponse.json({
      ok: true, modus: 'account',
      account: { id: account.id, weergavenaam: account.weergavenaam, email: account.email, status: account.status },
      mail,
    })
  }

  // ── Geen account ────────────────────────────────────────────────────────────
  if (!email) {
    return NextResponse.json({ error: 'Geen account met die naam. Vul een e-mailadres in — dan sturen we een downloadlink of een uitnodiging.' }, { status: 400 })
  }

  // JA: uitnodigen om een account aan te maken (invited account + activatielink).
  if (uitnodigen) {
    let gebruikersnaam = email
    if (db.prepare('SELECT 1 FROM gebruiker WHERE gebruikersnaam = ?').get(gebruikersnaam)) {
      gebruikersnaam = `${gebruikersnaam}-${maakDeelToken(3)}`
    }
    const inviteToken = maakDeelToken()
    const r = db.prepare(`
      INSERT INTO gebruiker (gebruikersnaam, weergavenaam, email, is_admin, status, invite_token)
      VALUES (?, ?, ?, 0, 'uitgenodigd', ?)
    `).run(gebruikersnaam, email, email, inviteToken)
    const nieuwId = Number(r.lastInsertRowid)
    db.prepare('INSERT OR IGNORE INTO deel_account (bestand_id, gebruiker_id, gedeeld_door) VALUES (?, ?, ?)')
      .run(Number(bestand_id), nieuwId, g.id)
    const mail = await mailUitnodiging(email, g.weergavenaam, bestandNaam, inviteToken)
    return NextResponse.json({ ok: true, modus: 'invite', uitnodiging: { token: inviteToken }, mail })
  }

  // NEE: unieke publieke downloadlink aanmaken en mailen (geen account nodig).
  const token = maakDeelToken()
  db.prepare('INSERT INTO deel_link (bestand_id, token, aangemaakt_door, modus) VALUES (?, ?, ?, ?)')
    .run(Number(bestand_id), token, g.id, 'download')
  const mail = await mailPubliekeLink([email], g.weergavenaam, bestandNaam, appUrl(`/d/${token}`), { bericht: String(bericht || '') })
  return NextResponse.json({ ok: true, modus: 'link', token, mail })
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
