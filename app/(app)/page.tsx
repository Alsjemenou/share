'use client'
import { useCallback, useEffect, useState } from 'react'
import Uploader from '@/components/Uploader'
import DeelDialog from '@/components/DeelDialog'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

type Bestand = {
  id: number; originele_naam: string; mime: string; grootte: number; created_at: string
  aantal_links: number; aantal_accounts: number; downloads: number
}

export default function MijnBestandenPage() {
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)
  const [deel, setDeel] = useState<Bestand | null>(null)

  const laad = useCallback(async () => {
    const r = await fetch('/api/bestanden')
    if (r.ok) setBestanden((await r.json()).bestanden)
    setLaden(false)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function verwijder(b: Bestand) {
    if (!confirm(`"${b.originele_naam}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    await fetch('/api/bestanden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
    laad()
  }

  const totaal = bestanden.reduce((s, b) => s + b.grootte, 0)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mijn bestanden</h1>
        <p className="text-sm text-gray-500 mt-1">Upload bestanden en deel ze via een link of met iemands account.</p>
      </div>

      <Uploader onKlaar={laad} />

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Bestanden {bestanden.length > 0 && <span className="text-gray-500 font-normal">({bestanden.length} · {formatBytes(totaal)})</span>}</h2>
        </div>

        {laden ? (
          <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
        ) : bestanden.length === 0 ? (
          <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">
            Nog geen bestanden. Sleep hierboven iets naar binnen om te beginnen.
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
                    <span>{formatDatumKort(b.created_at)}</span>
                    {b.aantal_links > 0 && <span>🔗 {b.aantal_links}</span>}
                    {b.aantal_accounts > 0 && <span>👤 {b.aantal_accounts}</span>}
                    {b.downloads > 0 && <span>⬇️ {b.downloads}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setDeel(b)} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Delen</button>
                  <a href={`/api/bestand/${b.id}/download`} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5">⬇️</a>
                  <button onClick={() => verwijder(b)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deel && <DeelDialog bestand={deel} onClose={() => setDeel(null)} onWijziging={laad} />}
    </div>
  )
}
