import fs from 'fs'
import { Readable } from 'stream'
import { NextRequest, NextResponse } from 'next/server'

// Streamt een bestand vanaf schijf naar de HTTP-response, met ondersteuning voor
// Range-verzoeken (hervatbare downloads / video-seek) — belangrijk bij grote bestanden.
export function serveerBestand(
  req: NextRequest,
  absPad: string,
  opties: { mime: string; naam: string; alsBijlage?: boolean },
): NextResponse {
  let stat: fs.Stats
  try {
    stat = fs.statSync(absPad)
    if (!stat.isFile()) throw new Error('geen bestand')
  } catch {
    return NextResponse.json({ error: 'Bestand ontbreekt' }, { status: 404 })
  }

  const totaal = stat.size
  const naamAscii = opties.naam.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const naamUtf8 = encodeURIComponent(opties.naam)
  const dispositie = `${opties.alsBijlage ? 'attachment' : 'inline'}; filename="${naamAscii}"; filename*=UTF-8''${naamUtf8}`

  const basisHeaders: Record<string, string> = {
    'Content-Type': opties.mime || 'application/octet-stream',
    'Content-Disposition': dispositie,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  }

  const range = req.headers.get('range')
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0
      let eind = m[2] ? parseInt(m[2], 10) : totaal - 1
      if (isNaN(start)) start = 0
      if (isNaN(eind) || eind >= totaal) eind = totaal - 1
      if (start > eind || start >= totaal) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${totaal}`, 'Accept-Ranges': 'bytes' },
        })
      }
      const nodeStream = fs.createReadStream(absPad, { start, end: eind })
      const web = Readable.toWeb(nodeStream) as unknown as ReadableStream
      return new NextResponse(web, {
        status: 206,
        headers: {
          ...basisHeaders,
          'Content-Range': `bytes ${start}-${eind}/${totaal}`,
          'Content-Length': String(eind - start + 1),
        },
      })
    }
  }

  const nodeStream = fs.createReadStream(absPad)
  const web = Readable.toWeb(nodeStream) as unknown as ReadableStream
  return new NextResponse(web, {
    status: 200,
    headers: { ...basisHeaders, 'Content-Length': String(totaal) },
  })
}
