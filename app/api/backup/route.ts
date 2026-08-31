import { NextRequest, NextResponse } from 'next/server'
import { getDb, closeDb, DB_PATH } from '@/lib/db'
import { vereisAdmin } from '@/lib/auth'
import AdmZip from 'adm-zip'
import fs from 'fs'

export const runtime = 'nodejs'

// GET → download ZIP met alleen de database (accounts + bestand-metadata + deel-links).
// De eigenlijke bestanden (data/bestanden/) zitten er BEWUST niet in: die kunnen
// tientallen GB's zijn en horen in je reguliere (versleutelde) back-up van data/.
export async function GET() {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const db = getDb()
  db.pragma('wal_checkpoint(TRUNCATE)')

  const zip = new AdmZip()
  if (fs.existsSync(DB_PATH)) zip.addLocalFile(DB_PATH, '', 'share.db')

  const buffer = zip.toBuffer()
  const datum = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="share-backup-${datum}.zip"`,
    },
  })
}

// POST → herstel de database uit een geüploade ZIP (veld 'backup').
export async function POST(req: NextRequest) {
  const { fout } = await vereisAdmin()
  if (fout) return fout
  const form = await req.formData()
  const file = form.get('backup') as File | null
  if (!file) return NextResponse.json({ error: 'Geen bestand' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let zip: AdmZip
  try { zip = new AdmZip(buffer) } catch { return NextResponse.json({ error: 'Ongeldig ZIP-bestand' }, { status: 400 }) }

  const entries = zip.getEntries()
  const dbEntry = entries.find(e => e.entryName.endsWith('share.db'))
  if (!dbEntry) return NextResponse.json({ error: 'Geen share.db in de backup gevonden' }, { status: 400 })

  closeDb()
  for (const suffix of ['-wal', '-shm']) {
    try { fs.unlinkSync(DB_PATH + suffix) } catch { /* bestaat niet */ }
  }
  fs.writeFileSync(DB_PATH, dbEntry.getData())

  // Heropen zodat migraties draaien.
  getDb()
  return NextResponse.json({ ok: true })
}
