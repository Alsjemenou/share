import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { vereisAdmin, hashWachtwoord } from '@/lib/auth'

export const runtime = 'nodejs'

// Lijst gebruikers + aantal bestanden per persoon (beheer).
export async function GET() {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const db = getDb()
  const gebruikers = db.prepare(`
    SELECT g.id, g.gebruikersnaam, g.weergavenaam, g.email, g.is_admin, g.status, g.mag_branding, g.created_at,
           (SELECT COUNT(*) FROM bestand b WHERE b.eigenaar_id = g.id) AS aantal_bestanden
    FROM gebruiker g ORDER BY g.status, g.gebruikersnaam
  `).all()
  return NextResponse.json({ gebruikers })
}

// Nieuwe gebruiker toevoegen (direct actief, met wachtwoord).
export async function POST(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const { gebruikersnaam, weergavenaam, email, wachtwoord, is_admin } = await req.json()
  if (!gebruikersnaam || !wachtwoord || String(wachtwoord).length < 6) {
    return NextResponse.json({ error: 'Gebruikersnaam en wachtwoord (min. 6 tekens) verplicht' }, { status: 400 })
  }
  const db = getDb()
  if (db.prepare('SELECT id FROM gebruiker WHERE gebruikersnaam = ?').get(String(gebruikersnaam).trim())) {
    return NextResponse.json({ error: 'Die gebruikersnaam bestaat al' }, { status: 400 })
  }
  const r = db.prepare(`
    INSERT INTO gebruiker (gebruikersnaam, weergavenaam, email, wachtwoord_hash, is_admin, status)
    VALUES (?, ?, ?, ?, ?, 'actief')
  `).run(
    String(gebruikersnaam).trim(),
    String(weergavenaam || gebruikersnaam).trim(),
    email ? String(email).trim() : null,
    hashWachtwoord(String(wachtwoord)),
    is_admin ? 1 : 0,
  )
  return NextResponse.json({ id: Number(r.lastInsertRowid) })
}

// Gebruiker bijwerken (weergavenaam, admin-vlag, wachtwoord resetten).
export async function PUT(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const { id, weergavenaam, is_admin, mag_branding, nieuw_wachtwoord } = await req.json()
  const db = getDb()
  if (weergavenaam !== undefined) {
    db.prepare('UPDATE gebruiker SET weergavenaam = ? WHERE id = ?').run(String(weergavenaam).trim(), id)
  }
  if (is_admin !== undefined) {
    db.prepare('UPDATE gebruiker SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id)
  }
  if (mag_branding !== undefined) {
    db.prepare('UPDATE gebruiker SET mag_branding = ? WHERE id = ?').run(mag_branding ? 1 : 0, id)
  }
  if (nieuw_wachtwoord) {
    if (String(nieuw_wachtwoord).length < 6) {
      return NextResponse.json({ error: 'Wachtwoord moet minstens 6 tekens zijn' }, { status: 400 })
    }
    db.prepare("UPDATE gebruiker SET wachtwoord_hash = ?, status = 'actief' WHERE id = ?")
      .run(hashWachtwoord(String(nieuw_wachtwoord)), id)
  }
  return NextResponse.json({ ok: true })
}

// Gebruiker verwijderen (incl. bestanden op schijf). Je kunt jezelf niet wissen.
export async function DELETE(req: NextRequest) {
  const { fout, g } = await vereisAdmin()
  if (fout) return fout
  const { id } = await req.json()
  if (Number(id) === g!.id) {
    return NextResponse.json({ error: 'Je kunt je eigen account niet verwijderen' }, { status: 400 })
  }
  const db = getDb()
  db.prepare('DELETE FROM gebruiker WHERE id = ?').run(id) // bestanden/deelrijen cascaden mee
  try { fs.rmSync(path.join(BESTAND_DIR, String(id)), { recursive: true, force: true }) } catch { /* al weg */ }
  return NextResponse.json({ ok: true })
}
