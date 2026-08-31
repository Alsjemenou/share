import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { getDb, BESTAND_DIR } from '@/lib/db'
import { linkOngeldigReden, leesGrant, type DeelLink } from '@/lib/deel'
import { serveerBestand } from '@/lib/bestandStream'

export const runtime = 'nodejs'

// Streamt het bestand achter een publieke link. Vereist een geldige download-grant
// (uit GET/POST op de link) zodat een linkwachtwoord nooit in de URL hoeft.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const grantLid = leesGrant(req.nextUrl.searchParams.get('dl'))
  if (grantLid == null) {
    return NextResponse.json({ error: 'Download niet vrijgegeven. Open de link opnieuw.' }, { status: 403 })
  }

  const db = getDb()
  const link = db.prepare(`
    SELECT dl.*, b.eigenaar_id, b.opgeslagen_naam, b.originele_naam, b.mime
    FROM deel_link dl JOIN bestand b ON b.id = dl.bestand_id
    WHERE dl.token = ?
  `).get(token) as
    | (DeelLink & { eigenaar_id: number; opgeslagen_naam: string; originele_naam: string; mime: string })
    | undefined

  if (!link || link.id !== grantLid) return NextResponse.json({ error: 'Ongeldige link' }, { status: 404 })

  const reden = linkOngeldigReden(link)
  if (reden) return NextResponse.json({ error: reden }, { status: 410 })

  const veilig = path.basename(link.opgeslagen_naam)
  const absPad = path.join(BESTAND_DIR, String(link.eigenaar_id), veilig)

  // Alleen bij de eerste (niet-Range) aanvraag: teller ophogen + loggen.
  if (!req.headers.get('range')) {
    db.prepare('UPDATE deel_link SET download_count = download_count + 1 WHERE id = ?').run(link.id)
    db.prepare('INSERT INTO download_log (bestand_id, deel_link_id, ip) VALUES (?, ?, ?)').run(
      link.bestand_id, link.id, req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || null,
    )
  }

  return serveerBestand(req, absPad, { mime: link.mime, naam: link.originele_naam, alsBijlage: true })
}
