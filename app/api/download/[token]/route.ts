import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { checkWachtwoord } from '@/lib/auth'
import { linkOngeldigReden, maakGrant, type DeelLink } from '@/lib/deel'
import { haalMerk } from '@/lib/merk'

export const runtime = 'nodejs'

type LinkMetBestand = DeelLink & {
  originele_naam: string
  mime: string
  grootte: number
  eigenaar_id: number
}

function haalLink(token: string): LinkMetBestand | undefined {
  const db = getDb()
  return db.prepare(`
    SELECT dl.*, b.originele_naam, b.mime, b.grootte, b.eigenaar_id
    FROM deel_link dl JOIN bestand b ON b.id = dl.bestand_id
    WHERE dl.token = ?
  `).get(token) as LinkMetBestand | undefined
}

// Publieke metadata over een deel-link (geen download, geen teller).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = haalLink(token)
  if (!link) return NextResponse.json({ error: 'Deze link bestaat niet.' }, { status: 404 })

  const reden = linkOngeldigReden(link)
  const heeftWachtwoord = !!link.wachtwoord_hash

  return NextResponse.json({
    naam: link.originele_naam,
    grootte: link.grootte,
    mime: link.mime,
    heeft_wachtwoord: heeftWachtwoord,
    reden,
    merk: haalMerk(link.eigenaar_id),
    // Zonder wachtwoord en geldig: direct een download-grant meegeven.
    grant: !reden && !heeftWachtwoord ? maakGrant(link.id) : null,
  })
}

// Wachtwoord controleren → download-grant teruggeven.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = haalLink(token)
  if (!link) return NextResponse.json({ error: 'Deze link bestaat niet.' }, { status: 404 })

  const reden = linkOngeldigReden(link)
  if (reden) return NextResponse.json({ error: reden }, { status: 410 })

  const { wachtwoord } = await req.json()
  if (link.wachtwoord_hash && !checkWachtwoord(String(wachtwoord || ''), link.wachtwoord_hash)) {
    return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 })
  }
  return NextResponse.json({ grant: maakGrant(link.id) })
}
