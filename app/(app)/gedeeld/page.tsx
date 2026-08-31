'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

type Map = { id: number; naam: string; aantal_submappen: number; aantal_bestanden: number; eigenaar_naam?: string }
type Bestand = { id: number; originele_naam: string; mime: string; grootte: number; created_at: string; eigenaar_naam: string }
type Kruimel = { id: number; naam: string }

export default function GedeeldPage() {
  const [huidigeMap, setHuidigeMap] = useState<number | null>(null)
  const [kruimels, setKruimels] = useState<Kruimel[]>([])
  const [mappen, setMappen] = useState<Map[]>([])
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)

  const laad = useCallback(async (mapId: number | null) => {
    setLaden(true)
    const r = await fetch(`/api/gedeeld${mapId != null ? `?map=${mapId}` : ''}`)
    if (r.ok) {
      const d = await r.json()
      setHuidigeMap(d.huidige_map); setKruimels(d.kruimels); setMappen(d.mappen); setBestanden(d.bestanden)
    }
    setLaden(false)
  }, [])
  useEffect(() => { laad(null) }, [laad])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Gedeeld met mij</h1>
        <p className="text-sm text-gray-500 mt-1">Bestanden en mappen die anderen met jou of met een groep waar je in zit hebben gedeeld.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm mb-3">
        <button onClick={() => laad(null)} className={`px-2 py-1 rounded-lg ${huidigeMap == null ? 'text-amber-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>📥 Gedeeld met mij</button>
        {kruimels.map((k, i) => (
          <span key={k.id} className="flex items-center gap-1">
            <span className="text-gray-600">/</span>
            <button onClick={() => laad(k.id)} className={`px-2 py-1 rounded-lg ${i === kruimels.length - 1 ? 'text-amber-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{k.naam}</button>
          </span>
        ))}
      </div>

      {laden ? (
        <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
      ) : mappen.length === 0 && bestanden.length === 0 ? (
        <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">{huidigeMap == null ? 'Er is nog niets met je gedeeld.' : 'Deze map is leeg.'}</div>
      ) : (
        <div className="space-y-2">
          {mappen.map(m => (
            <button key={`m${m.id}`} onClick={() => laad(m.id)} className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-gray-700">
              <span className="text-2xl shrink-0">📂</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{m.naam}</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  {m.eigenaar_naam && <span>van {m.eigenaar_naam}</span>}
                  {m.aantal_submappen > 0 && <span>{m.aantal_submappen} submap{m.aantal_submappen === 1 ? '' : 'pen'}</span>}
                  <span>{m.aantal_bestanden} bestand{m.aantal_bestanden === 1 ? '' : 'en'}</span>
                </div>
              </div>
              <span className="text-gray-500 text-sm">›</span>
            </button>
          ))}
          {bestanden.map(b => (
            <div key={`b${b.id}`} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl shrink-0">{bestandIcoon(b.mime, b.originele_naam)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{b.originele_naam}</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  <span>{formatBytes(b.grootte)}</span>
                  <span>van {b.eigenaar_naam}</span>
                  <span>{formatDatumKort(b.created_at)}</span>
                </div>
              </div>
              <a href={`/api/bestand/${b.id}/download`} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium shrink-0">⬇️ Download</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
