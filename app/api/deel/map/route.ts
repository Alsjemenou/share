import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { magMapBeheren, maakDeelToken } from '@/lib/deel'
import { mailDeelMelding, mailUitnodiging, mailPubliekeLink, appUrl } from '@/lib/mail'

export const runtime = 'nodejs'

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// Met wie is een map gedeeld (accounts + groepen)?
export async function GET(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const mapId = Number(req.nextUrl.searchParams.get('map'))
  if (!magMapBeheren(g, mapId)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()

  const accounts = db.prepare(`
    SELECT dm.id, dm.mag_uploaden, u.id AS gebruiker_id, u.weergavenaam, u.email, u.status, u.invite_token
    FROM deel_map dm JOIN gebruiker u ON u.id = dm.ontvanger_id
    WHERE dm.map_id = ? AND dm.ontvanger_type = 'account' ORDER BY u.weergavenaam COLLATE NOCASE
  `).all(mapId)
  const groepen = db.prepare(`
    SELECT dm.id, dm.mag_uploaden, gr.id AS groep_id, gr.naam,
           (SELECT COUNT(*) FROM groep_lid gl WHERE gl.groep_id = gr.id) AS aantal_leden
    FROM deel_map dm JOIN groep gr ON gr.id = dm.ontvanger_id
    WHERE dm.map_id = ? AND dm.ontvanger_type = 'groep' ORDER BY gr.naam COLLATE NOCASE
  `).all(mapId)
  return NextResponse.json({ accounts, groepen })
}

// Map delen met een groep (eigen groep) of met een account (op naam/e-mail, met uitnodiging).
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { map_id, groep_id, ontvanger, mag_uploaden, uitnodigen, bericht } = await req.json()
  if (!magMapBeheren(g, Number(map_id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const db = getDb()
  const upload = mag_uploaden ? 1 : 0
  const mapRij = db.prepare('SELECT naam FROM map WHERE id = ?').get(Number(map_id)) as { naam: string } | undefined
  const mapNaam = mapRij?.naam || 'een map'

  // ── Met een groep ─────────────────────────────────────────────────────────
  if (groep_id != null) {
    if (!db.prepare('SELECT 1 FROM groep WHERE id = ? AND eigenaar_id = ?').get(groep_id, g.id)) {
      return NextResponse.json({ error: 'Groep niet gevonden' }, { status: 400 })
    }
    db.prepare(`
      INSERT INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door, mag_uploaden) VALUES (?, 'groep', ?, ?, ?)
      ON CONFLICT(map_id, ontvanger_type, ontvanger_id) DO UPDATE SET mag_uploaden = excluded.mag_uploaden
    `).run(Number(map_id), Number(groep_id), g.id, upload)
    return NextResponse.json({ ok: true })
  }

  // ── Met een account / per e-mail ──────────────────────────────────────────
  const invoer = String(ontvanger || '').trim()
  if (!invoer) return NextResponse.json({ error: 'Kies een groep of vul een naam/e-mail in' }, { status: 400 })
  const email = isEmail(invoer) ? invoer : null

  const account = db.prepare(
    'SELECT id, weergavenaam, email, status FROM gebruiker WHERE email = ? COLLATE NOCASE OR gebruikersnaam = ?'
  ).get(email, invoer) as { id: number; weergavenaam: string; email: string | null; status: string } | undefined

  // Bestaand account → map delen onder "Gedeeld met mij".
  if (account) {
    db.prepare(`
      INSERT INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door, mag_uploaden) VALUES (?, 'account', ?, ?, ?)
      ON CONFLICT(map_id, ontvanger_type, ontvanger_id) DO UPDATE SET mag_uploaden = excluded.mag_uploaden
    `).run(Number(map_id), account.id, g.id, upload)
    const mail = account.email ? await mailDeelMelding(account.email, g.weergavenaam, mapNaam) : undefined
    return NextResponse.json({
      ok: true, modus: 'account',
      account: { id: account.id, weergavenaam: account.weergavenaam, email: account.email, status: account.status },
      mail,
    })
  }

  if (!email) {
    return NextResponse.json({ error: 'Geen account met die naam. Vul een e-mailadres in — dan sturen we een downloadlink of een uitnodiging.' }, { status: 400 })
  }

  // JA: uitnodigen om een account aan te maken (invited account + map-deling + activatielink).
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
    db.prepare(`
      INSERT INTO deel_map (map_id, ontvanger_type, ontvanger_id, gedeeld_door, mag_uploaden) VALUES (?, 'account', ?, ?, ?)
      ON CONFLICT(map_id, ontvanger_type, ontvanger_id) DO UPDATE SET mag_uploaden = excluded.mag_uploaden
    `).run(Number(map_id), Number(r.lastInsertRowid), g.id, upload)
    const mail = await mailUitnodiging(email, g.weergavenaam, mapNaam, inviteToken)
    return NextResponse.json({ ok: true, modus: 'invite', uitnodiging: { token: inviteToken }, mail })
  }

  // NEE: publieke map-downloadlink (hele map als zip, geen account) + mailen.
  const token = maakDeelToken()
  db.prepare('INSERT INTO deel_map_link (map_id, token, aangemaakt_door) VALUES (?, ?, ?)')
    .run(Number(map_id), token, g.id)
  const mail = await mailPubliekeLink([email], g.weergavenaam, mapNaam, appUrl(`/dm/${token}`), { map: true, bericht: String(bericht || '') })
  return NextResponse.json({ ok: true, modus: 'maplink', token, mail })
}

// Deling van een map intrekken.
export async function DELETE(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { id } = await req.json()
  const db = getDb()
  const rij = db.prepare('SELECT map_id FROM deel_map WHERE id = ?').get(id) as { map_id: number } | undefined
  if (!rij || !magMapBeheren(g, rij.map_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  db.prepare('DELETE FROM deel_map WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
