import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, hashWachtwoord, checkWachtwoord } from '@/lib/auth'

// Eigen profiel bijwerken: weergavenaam en/of wachtwoord.
export async function PUT(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { weergavenaam, huidig_wachtwoord, nieuw_wachtwoord } = await req.json()
  const db = getDb()

  if (weergavenaam && String(weergavenaam).trim()) {
    db.prepare('UPDATE gebruiker SET weergavenaam = ? WHERE id = ?').run(String(weergavenaam).trim(), g.id)
  }

  if (nieuw_wachtwoord) {
    if (String(nieuw_wachtwoord).length < 6) {
      return NextResponse.json({ error: 'Nieuw wachtwoord moet minstens 6 tekens zijn' }, { status: 400 })
    }
    const rij = db.prepare('SELECT wachtwoord_hash FROM gebruiker WHERE id = ?').get(g.id) as { wachtwoord_hash: string }
    if (!checkWachtwoord(String(huidig_wachtwoord || ''), rij.wachtwoord_hash)) {
      return NextResponse.json({ error: 'Huidig wachtwoord klopt niet' }, { status: 400 })
    }
    db.prepare('UPDATE gebruiker SET wachtwoord_hash = ? WHERE id = ?').run(hashWachtwoord(String(nieuw_wachtwoord)), g.id)
  }
  return NextResponse.json({ ok: true })
}
