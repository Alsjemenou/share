'use client'
import { useEffect, useState } from 'react'

type Props = {
  bestand: { id: number; originele_naam: string }
  eigenaarId?: number  // beheerder verplaatst namens de eigenaar
  onClose: () => void
  onKlaar: () => void
}

// Verplaats een bestand naar een (andere) map van de eigenaar, of naar de hoofdmap.
export default function VerplaatsDialog({ bestand, eigenaarId, onClose, onKlaar }: Props) {
  const [mappen, setMappen] = useState<{ id: number; naam: string; pad: string }[]>([])
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/mappen/boom${eigenaarId != null ? `?eigenaar=${eigenaarId}` : ''}`)
      if (r.ok) setMappen((await r.json()).mappen)
      setLaden(false)
    })()
  }, [eigenaarId])

  async function verplaatsNaar(mapId: number | null) {
    await fetch('/api/bestanden', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bestand.id, map_id: mapId }) })
    onKlaar()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="font-semibold text-sm truncate">Verplaats: {bestand.originele_naam}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">✕</button>
        </div>
        <div className="p-3 space-y-1">
          {laden ? (
            <div className="text-sm text-gray-500 text-center py-3">Laden…</div>
          ) : (
            <>
              <button onClick={() => verplaatsNaar(null)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-800">🏠 Hoofdmap</button>
              {mappen.map(m => (
                <button key={m.id} onClick={() => verplaatsNaar(m.id)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-800">📂 {m.pad}</button>
              ))}
              {mappen.length === 0 && <div className="text-xs text-gray-500 px-3 py-2">Geen mappen. Maak er eerst een aan bij “Mijn bestanden”.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
