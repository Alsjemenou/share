'use client'
import { useEffect, useState } from 'react'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

type Bestand = {
  id: number; originele_naam: string; mime: string; grootte: number
  created_at: string; gedeeld_op: string; eigenaar_naam: string
}

export default function GedeeldPage() {
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/gedeeld')
      if (r.ok) setBestanden((await r.json()).bestanden)
      setLaden(false)
    })()
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Gedeeld met mij</h1>
        <p className="text-sm text-gray-500 mt-1">Bestanden die anderen met jouw account hebben gedeeld.</p>
      </div>

      {laden ? (
        <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
      ) : bestanden.length === 0 ? (
        <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">
          Er is nog niets met je gedeeld.
        </div>
      ) : (
        <div className="space-y-2">
          {bestanden.map(b => (
            <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl shrink-0">{bestandIcoon(b.mime, b.originele_naam)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{b.originele_naam}</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  <span>{formatBytes(b.grootte)}</span>
                  <span>van {b.eigenaar_naam}</span>
                  <span>gedeeld op {formatDatumKort(b.gedeeld_op)}</span>
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
