import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { vereisAdmin } from '@/lib/auth'
import { haalMailConfig, mailGeconfigureerd, verstuurMail } from '@/lib/mail'

export const runtime = 'nodejs'

// Sleutels met een geheim: nooit onversleuteld terug naar de client.
const GEHEIM = new Set(['mail_gmail_wachtwoord', 'mail_smtp_wachtwoord'])
const GEMASKEERD = '__SET__'
// Welke sleutels deze route beheert (de SMB-backupconfig loopt via /api/backup/smb).
const TOEGESTAAN = new Set([
  'mail_enabled', 'mail_methode', 'mail_afzender',
  'mail_gmail_user', 'mail_gmail_wachtwoord',
  'mail_smtp_host', 'mail_smtp_port', 'mail_smtp_secure', 'mail_smtp_user', 'mail_smtp_wachtwoord', 'mail_smtp_from',
])

export async function GET() {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const db = getDb()
  const rows = db.prepare('SELECT sleutel, waarde FROM instellingen').all() as { sleutel: string; waarde: string }[]
  const result: Record<string, string> = {}
  for (const r of rows) {
    if (!TOEGESTAAN.has(r.sleutel)) continue
    result[r.sleutel] = GEHEIM.has(r.sleutel) ? (r.waarde ? GEMASKEERD : '') : r.waarde
  }
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const db = getDb()
  const body = await req.json() as Record<string, string>
  const upsert = db.prepare('INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES (?, ?)')
  for (const [sleutel, waarde] of Object.entries(body)) {
    if (!TOEGESTAAN.has(sleutel)) continue
    // Leeg of gemaskeerd geheim → bestaande waarde behouden.
    if (GEHEIM.has(sleutel) && (!waarde || waarde === GEMASKEERD)) continue
    upsert.run(sleutel, String(waarde))
  }
  return NextResponse.json({ ok: true })
}

// POST { actie: 'test-mail', naar } → stuur een testmail naar het opgegeven adres.
export async function POST(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const { actie, naar } = await req.json().catch(() => ({}))
  if (actie !== 'test-mail') return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })

  const c = haalMailConfig()
  const adres = String(naar || '').trim() || c.from
  if (!mailGeconfigureerd(c)) return NextResponse.json({ error: 'Vul eerst de mailgegevens in en sla op (server/afzender/wachtwoord).' }, { status: 400 })
  if (!adres) return NextResponse.json({ error: 'Geen ontvanger-e-mailadres.' }, { status: 400 })
  try {
    await verstuurMail(c, adres, 'Testmail — Deel', '<p>Dit is een testmail vanuit Deel. De e-mailnotificaties werken. ✅</p>')
    return NextResponse.json({ ok: true, naar: adres })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
