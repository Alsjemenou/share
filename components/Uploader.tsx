'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBytes } from '@/lib/format'

const CHUNK = 8 * 1024 * 1024 // 8 MB per stuk

type Taak = {
  id: string
  naam: string
  grootte: number
  verzonden: number
  status: 'wacht' | 'bezig' | 'klaar' | 'fout'
  fout?: string
}

async function postChunk(uploadId: string, offset: number, blob: Blob): Promise<{ ok: boolean; ontvangen?: number; status: number }> {
  const r = await fetch(`/api/upload/chunk?id=${encodeURIComponent(uploadId)}&offset=${offset}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob,
  })
  let d: { ontvangen?: number } = {}
  try { d = await r.json() } catch { /* leeg */ }
  return { ok: r.ok, ontvangen: d.ontvangen, status: r.status }
}

export default function Uploader({ onKlaar, mapId = null }: { onKlaar: () => void; mapId?: number | null }) {
  const [taken, setTaken] = useState<Taak[]>([])
  const [sleep, setSleep] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mapInputRef = useRef<HTMLInputElement>(null)

  // 'webkitdirectory' is geen standaard React-attribuut → via ref zetten.
  useEffect(() => {
    const el = mapInputRef.current
    if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') }
  }, [])

  const update = useCallback((id: string, patch: Partial<Taak>) => {
    setTaken(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const uploadEen = useCallback(async (taakId: string, file: File, doelMap: number | null) => {
    update(taakId, { status: 'bezig', verzonden: 0 })
    try {
      const startR = await fetch('/api/upload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: file.name, grootte: file.size, mime: file.type || 'application/octet-stream', map_id: doelMap }),
      })
      const startD = await startR.json()
      if (!startR.ok) throw new Error(startD.error || 'Kon upload niet starten')
      const uploadId: string = startD.upload_id

      let offset = 0
      while (offset < file.size) {
        const eind = Math.min(offset + CHUNK, file.size)
        const blob = file.slice(offset, eind)
        let poging = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const res = await postChunk(uploadId, offset, blob)
          if (res.ok) { offset = res.ontvangen ?? eind; break }
          if (res.status === 409 && typeof res.ontvangen === 'number') { offset = res.ontvangen; break }
          if (++poging >= 3) throw new Error('Upload van een deel mislukte')
          await new Promise(r => setTimeout(r, 500 * poging))
        }
        update(taakId, { verzonden: offset })
      }

      const finR = await fetch(`/api/upload/finish?id=${encodeURIComponent(uploadId)}`, { method: 'POST' })
      const finD = await finR.json()
      if (!finR.ok) throw new Error(finD.error || 'Afronden mislukte')

      update(taakId, { status: 'klaar', verzonden: file.size })
      onKlaar()
    } catch (e) {
      update(taakId, { status: 'fout', fout: e instanceof Error ? e.message : 'Onbekende fout' })
    }
  }, [onKlaar, update])

  // Losse bestanden → in de huidige map.
  const voegToe = useCallback(async (files: FileList | File[]) => {
    const lijst = Array.from(files)
    const nieuw: Taak[] = lijst.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      naam: f.name, grootte: f.size, verzonden: 0, status: 'wacht',
    }))
    setTaken(prev => [...nieuw, ...prev])
    for (let i = 0; i < lijst.length; i++) await uploadEen(nieuw[i].id, lijst[i], mapId)
  }, [uploadEen, mapId])

  // Hele map (incl. submappen) → maak de mapstructuur na, upload elk bestand erin.
  const voegMapToe = useCallback(async (files: FileList) => {
    const lijst = Array.from(files)
    if (lijst.length === 0) return
    const nieuw: Taak[] = lijst.map(f => {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      return { id: `${rel}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, naam: rel, grootte: f.size, verzonden: 0, status: 'wacht' as const }
    })
    setTaken(prev => [...nieuw, ...prev])

    // Cache van mappad → aangemaakte map-id. Maakt ontbrekende mappen aan.
    const dirCache = new Map<string, number | null>()
    async function ensureDir(segs: string[]): Promise<number | null> {
      let key = ''
      let parent: number | null = mapId
      for (const seg of segs) {
        key = key ? `${key}/${seg}` : seg
        if (dirCache.has(key)) { parent = dirCache.get(key)!; continue }
        const r = await fetch('/api/mappen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: seg, ouder_id: parent }) })
        const d = await r.json()
        const id = r.ok ? Number(d.id) : parent
        dirCache.set(key, id)
        parent = id
      }
      return parent
    }

    for (let i = 0; i < lijst.length; i++) {
      const f = lijst[i]
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const segs = rel.split('/').filter(Boolean)
      const dirSegs = segs.slice(0, -1)
      const doel = dirSegs.length ? await ensureDir(dirSegs) : mapId
      await uploadEen(nieuw[i].id, f, doel)
    }
    onKlaar()
  }, [uploadEen, mapId, onKlaar])

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setSleep(true) }}
        onDragLeave={() => setSleep(false)}
        onDrop={e => { e.preventDefault(); setSleep(false); if (e.dataTransfer.files.length) voegToe(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          sleep ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-900'
        }`}
      >
        <div className="text-4xl mb-2">⬆️</div>
        <div className="font-medium">Sleep bestanden hierheen of klik om te kiezen</div>
        <div className="text-xs text-gray-500 mt-1">Grote bestanden worden in stukken geüpload en kunnen hervatten.</div>
        <div className="mt-3">
          <button
            onClick={e => { e.stopPropagation(); mapInputRef.current?.click() }}
            className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium"
          >📁 Map uploaden (incl. submappen)</button>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) voegToe(e.target.files); e.target.value = '' }} />
        <input ref={mapInputRef} type="file" className="hidden" onChange={e => { if (e.target.files?.length) voegMapToe(e.target.files); e.target.value = '' }} />
      </div>

      {taken.length > 0 && (
        <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
          {taken.map(t => {
            const pct = t.grootte > 0 ? Math.round((t.verzonden / t.grootte) * 100) : (t.status === 'klaar' ? 100 : 0)
            return (
              <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{t.naam}</span>
                  <span className="text-xs text-gray-500">{formatBytes(t.verzonden)} / {formatBytes(t.grootte)}</span>
                  <span className={`text-xs font-medium ${
                    t.status === 'klaar' ? 'text-green-400' : t.status === 'fout' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {t.status === 'klaar' ? '✓ Klaar' : t.status === 'fout' ? 'Fout' : `${pct}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${t.status === 'fout' ? 'bg-red-500' : t.status === 'klaar' ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {t.status === 'fout' && <div className="text-xs text-red-400 mt-1">{t.fout}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
