import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd, type Gebruiker } from '@/lib/auth'
import { mailPubliekeLink, appUrl } from '@/lib/mail'

export const runtime = 'nodejs'

function magBeheren(g: Gebruiker, bestandId: number): boolean {
  if (g.is_admin) return true
  const db = getDb()
  return !!db.prepare('SELECT 1 FROM bestand WHERE id = ? AND eigenaar_id = ?').get(bestandId, g.id)
}

// POST { token, naar, bericht } → mail een bestaande publieke link naar één of meer
// adressen (komma/witruimte/puntkomma-gescheiden). Alleen de eigenaar/beheerder.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const { token, naar, bericht } = await req.json()

  const db = getDb()
  const link = db.prepare(`
    SELECT dl.token, dl.modus, dl.bestand_id, (dl.wachtwoord_hash IS NOT NULL) AS heeft_ww, b.originele_naam
    FROM deel_link dl JOIN bestand b ON b.id = dl.bestand_id
    WHERE dl.token = ?
  `).get(String(token || '')) as
    | { token: string; modus: string; bestand_id: number; heeft_ww: number; originele_naam: string }
    | undefined
  if (!link) return NextResponse.json({ error: 'Link niet gevonden' }, { status: 404 })
  if (!magBeheren(g, link.bestand_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const adressen = String(naar || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
  if (adressen.length === 0) return NextResponse.json({ error: 'Vul minstens één e-mailadres in' }, { status: 400 })
  const ongeldig = adressen.filter(a => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
  if (ongeldig.length) return NextResponse.json({ error: `Ongeldig e-mailadres: ${ongeldig.join(', ')}` }, { status: 400 })

  const res = await mailPubliekeLink(adressen, g.weergavenaam, link.originele_naam, appUrl(`/d/${link.token}`), {
    wachtwoord: !!link.heeft_ww,
    preview: link.modus === 'preview',
    bericht: String(bericht || '').slice(0, 2000),
  })
  if (!res.ok) {
    const code = res.overgeslagen ? 400 : 500
    return NextResponse.json({ error: res.error || `E-mail niet verstuurd (${res.overgeslagen})` }, { status: code })
  }
  return NextResponse.json({ ok: true, naar: res.naar })
}
