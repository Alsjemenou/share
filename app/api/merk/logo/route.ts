import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, MERK_DIR } from '@/lib/db'
import { huidigeGebruiker, nietIngelogd } from '@/lib/auth'
import { haalMerk, LOGO_TYPES } from '@/lib/merk'

export const runtime = 'nodejs'

const MAX = 2 * 1024 * 1024 // 2 MB

// Logo uploaden (veld 'logo'). Vervangt een bestaand logo.
export async function POST(req: NextRequest) {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()

  const form = await req.formData()
  const file = form.get('logo') as File | null
  if (!file) return NextResponse.json({ error: 'Geen bestand' }, { status: 400 })
  const ext = LOGO_TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Alleen PNG, JPG, WEBP of GIF' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: 'Logo mag maximaal 2 MB zijn' }, { status: 400 })

  const map = path.join(MERK_DIR, String(g.id))
  fs.mkdirSync(map, { recursive: true })
  // Oude logo's opruimen (kan andere extensie hebben).
  for (const oud of fs.existsSync(map) ? fs.readdirSync(map) : []) {
    if (oud.startsWith('logo.')) { try { fs.unlinkSync(path.join(map, oud)) } catch { /* nvt */ } }
  }
  const naam = `logo.${ext}`
  fs.writeFileSync(path.join(map, naam), Buffer.from(await file.arrayBuffer()))

  const db = getDb()
  db.prepare('UPDATE gebruiker SET merk_logo = ? WHERE id = ?').run(naam, g.id)
  return NextResponse.json({ merk: haalMerk(g.id) })
}

// Logo verwijderen.
export async function DELETE() {
  const g = await huidigeGebruiker()
  if (!g) return nietIngelogd()
  const db = getDb()
  const map = path.join(MERK_DIR, String(g.id))
  try { for (const f of fs.readdirSync(map)) if (f.startsWith('logo.')) fs.unlinkSync(path.join(map, f)) } catch { /* nvt */ }
  db.prepare('UPDATE gebruiker SET merk_logo = NULL WHERE id = ?').run(g.id)
  return NextResponse.json({ merk: haalMerk(g.id) })
}
