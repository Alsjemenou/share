'use client'
import { useEffect, useState } from 'react'

type MapItem = { id: number; naam: string; pad: string; eigenaar_id: number; eigenaar_naam: string }
type Props = {
  bestanden: { id: number; originele_naam: string }[]
  alleMappen?: boolean   // beheerder: kies uit ALLE mappen (met eigenaar-label)
  eigenaarId?: number    // beperk tot mappen van deze eigenaar
  onClose: () => void
  onKlaar: () => void
}

// Verplaats één of meer bestanden naar een map (of de hoofdmap).
export default function VerplaatsDialog({ bestanden, alleMappen, eigenaarId, onClose, onKlaar }: Props) {
  const [mappen, setMappen] = useState<MapItem[]>([])
  const [laden, setLaden] = useState(true)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    (async () => {
      const url = alleMappen ? '/api/mappen/boom?alle=1' : `/api/mappen/boom${eigenaarId != null ? `?eigenaar=${eigenaarId}` : ''}`
      const r = await fetch(url)
      if (r.ok) setMappen((await r.json()).mappen)
      setLaden(false)
    })()
  }, [alleMappen, eigenaarId])

  async function verplaatsNaar(mapId: number | null) {
    setBezig(true)
    await fetch('/api/bestanden', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: bestanden.map(b => b.id), map_id: mapId }) })
    onKlaar()
  }

  const titel = bestanden.length === 1 ? `Verplaats: ${bestanden[0].originele_naam}` : `Verplaats ${bestanden.length} bestanden`

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-2">
          <div className="font-semibold text-sm truncate">{titel}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 shrink-0">✕</button>
        </div>
        <div className="p-3 space-y-1">
          {laden ? (
            <div className="text-sm text-gray-500 text-center py-3">Laden…</div>
          ) : (
            <>
              <button disabled={bezig} onClick={() => verplaatsNaar(null)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50">🏠 Hoofdmap</button>
              {mappen.map(m => (
                <button key={m.id} disabled={bezig} onClick={() => verplaatsNaar(m.id)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50">
                  📂 {alleMappen ? <span><span className="text-gray-500">{m.eigenaar_naam} /</span> {m.pad}</span> : m.pad}
                </button>
              ))}
              {mappen.length === 0 && <div className="text-xs text-gray-500 px-3 py-2">Geen mappen beschikbaar. Maak er een aan bij “Mijn bestanden”.</div>}
            </>
          )}
        </div>
        {alleMappen && <div className="px-5 pb-4 text-[11px] text-gray-500">Verplaats je naar de map van een andere gebruiker, dan komt het bestand onder diens beheer.</div>}
      </div>
    </div>
  )
}
