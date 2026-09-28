'use client'
import { useCallback, useEffect, useState } from 'react'
import Uploader from '@/components/Uploader'
import DeelDialog, { type DeelDoel } from '@/components/DeelDialog'
import VerplaatsDialog from '@/components/VerplaatsDialog'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

type Map = { id: number; naam: string; aantal_submappen: number; aantal_bestanden: number }
type Bestand = {
  id: number; originele_naam: string; mime: string; grootte: number; created_at: string
  aantal_links: number; aantal_accounts: number; aantal_groepen: number; downloads: number
}
type Kruimel = { id: number; naam: string }

export default function MijnBestandenPage() {
  const [huidigeMap, setHuidigeMap] = useState<number | null>(null)
  const [kruimels, setKruimels] = useState<Kruimel[]>([])
  const [mappen, setMappen] = useState<Map[]>([])
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)
  const [deel, setDeel] = useState<(DeelDoel & { tab?: 'delen' | 'link' }) | null>(null)
  const [verplaats, setVerplaats] = useState<Bestand[] | null>(null)
  const [selectie, setSelectie] = useState<Set<number>>(new Set())

  const laad = useCallback(async (mapId: number | null) => {
    setLaden(true)
    setSelectie(new Set())
    const r = await fetch(`/api/mappen${mapId != null ? `?map=${mapId}` : ''}`)
    if (r.ok) {
      const d = await r.json()
      setHuidigeMap(d.huidige_map); setKruimels(d.kruimels); setMappen(d.mappen); setBestanden(d.bestanden)
    }
    setLaden(false)
  }, [])
  useEffect(() => { laad(null) }, [laad])

  async function nieuweMap() {
    const naam = prompt('Naam van de nieuwe map:')
    if (!naam?.trim()) return
    await fetch('/api/mappen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam, ouder_id: huidigeMap }) })
    laad(huidigeMap)
  }
  async function hernoemMap(m: Map) {
    const naam = prompt('Nieuwe naam:', m.naam); if (!naam?.trim()) return
    await fetch('/api/mappen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, naam }) })
    laad(huidigeMap)
  }
  async function wisMap(m: Map) {
    if (!confirm(`Map "${m.naam}" verwijderen? Submappen gaan mee; bestanden erin gaan terug naar de hoofdmap.`)) return
    await fetch('/api/mappen', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }) })
    laad(huidigeMap)
  }
  async function wisBestand(b: Bestand) {
    if (!confirm(`"${b.originele_naam}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    await fetch('/api/bestanden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
    laad(huidigeMap)
  }

  function toggleSel(id: number) {
    setSelectie(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function allesSel() {
    setSelectie(prev => prev.size === bestanden.length ? new Set() : new Set(bestanden.map(b => b.id)))
  }
  function downloadSelectie() {
    if (selectie.size === 0) return
    window.location.href = `/api/download-zip?ids=${[...selectie].join(',')}`
  }

  const totaal = bestanden.reduce((s, b) => s + b.grootte, 0)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mijn bestanden</h1>
          <p className="text-sm text-gray-500 mt-1">Orden bestanden in mappen en deel ze via een link, met een persoon of met een groep.</p>
        </div>
        <button onClick={nieuweMap} className="shrink-0 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 font-medium">📁 Nieuwe map</button>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm mb-3">
        <button onClick={() => laad(null)} className={`px-2 py-1 rounded-lg ${huidigeMap == null ? 'text-amber-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>🏠 Hoofdmap</button>
        {kruimels.map((k, i) => (
          <span key={k.id} className="flex items-center gap-1">
            <span className="text-gray-600">/</span>
            <button onClick={() => laad(k.id)} className={`px-2 py-1 rounded-lg ${i === kruimels.length - 1 ? 'text-amber-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{k.naam}</button>
          </span>
        ))}
        {huidigeMap != null && (
          <span className="ml-2 flex gap-1.5">
            <button onClick={() => setDeel({ soort: 'map', id: huidigeMap, naam: kruimels[kruimels.length - 1]?.naam || 'map' })} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Deze map delen</button>
            <a href={`/api/download-zip?map=${huidigeMap}`} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">⬇️ Map als zip</a>
          </span>
        )}
      </div>

      <div className="mt-2">
        {/* Selectiebalk */}
        {bestanden.length > 0 && (
          <div className="flex items-center gap-3 mb-3 text-sm">
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input type="checkbox" checked={selectie.size === bestanden.length && bestanden.length > 0} onChange={allesSel} />
              Alles
            </label>
            {selectie.size > 0 && (
              <>
                <span className="text-gray-400">{selectie.size} geselecteerd</span>
                <button onClick={downloadSelectie} className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium text-xs">⬇️ Download {selectie.size} als zip</button>
                <button onClick={() => setVerplaats(bestanden.filter(b => selectie.has(b.id)))} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium text-xs">↔️ Verplaats {selectie.size}</button>
                <button onClick={() => setSelectie(new Set())} className="text-gray-400 hover:text-white underline text-xs">Wis selectie</button>
              </>
            )}
          </div>
        )}

        {laden ? (
          <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
        ) : mappen.length === 0 && bestanden.length === 0 ? (
          <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">Deze map is leeg. Upload hieronder iets of maak een submap.</div>
        ) : (
          <div className="space-y-2">
            {/* Mappen */}
            {mappen.map(m => (
              <div key={`m${m.id}`} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <button onClick={() => laad(m.id)} className="text-2xl shrink-0">📂</button>
                <button onClick={() => laad(m.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-medium text-sm">{m.naam}</div>
                  <div className="text-xs text-gray-500">{m.aantal_submappen > 0 && `${m.aantal_submappen} submap${m.aantal_submappen === 1 ? '' : 'pen'} · `}{m.aantal_bestanden} bestand{m.aantal_bestanden === 1 ? '' : 'en'}</div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setDeel({ soort: 'map', id: m.id, naam: m.naam })} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Delen</button>
                  <a href={`/api/download-zip?map=${m.id}`} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium" title="Map als zip downloaden">Download</a>
                  <button onClick={() => hernoemMap(m)} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Hernoem</button>
                  <button onClick={() => wisMap(m)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium">Verwijder</button>
                </div>
              </div>
            ))}

            {/* Bestanden */}
            {bestanden.map(b => (
              <div key={`b${b.id}`} className={`bg-gray-900 border rounded-xl px-4 py-3 flex items-center gap-3 ${selectie.has(b.id) ? 'border-amber-500/60' : 'border-gray-800'}`}>
                <input type="checkbox" checked={selectie.has(b.id)} onChange={() => toggleSel(b.id)} className="shrink-0" />
                <span className="text-2xl shrink-0">{bestandIcoon(b.mime, b.originele_naam)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{b.originele_naam}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                    <span>{formatBytes(b.grootte)}</span>
                    <span>{formatDatumKort(b.created_at)}</span>
                    {b.aantal_links > 0 && <span>🔗 {b.aantal_links}</span>}
                    {b.aantal_accounts > 0 && <span>👤 {b.aantal_accounts}</span>}
                    {b.aantal_groepen > 0 && <span>👥 {b.aantal_groepen}</span>}
                    {b.downloads > 0 && <span>⬇️ {b.downloads}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setDeel({ soort: 'bestand', id: b.id, naam: b.originele_naam, mime: b.mime, tab: b.aantal_links > 0 ? 'link' : 'delen' })} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Delen</button>
                  <button onClick={() => setVerplaats([b])} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Verplaats</button>
                  <a href={`/api/bestand/${b.id}/download`} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Download</a>
                  <button onClick={() => wisBestand(b)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium">Verwijder</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!laden && bestanden.length > 0 && <div className="text-xs text-gray-500 mt-3">{bestanden.length} bestand{bestanden.length === 1 ? '' : 'en'} in deze map · {formatBytes(totaal)}</div>}
      </div>

      {/* Upload-veld onderaan (compact), zoals de verkenner */}
      <div className="mt-6">
        <div className="text-xs text-gray-500 mb-1.5">Uploaden naar {huidigeMap == null ? 'hoofdmap' : (kruimels[kruimels.length - 1]?.naam || 'map')}</div>
        <Uploader onKlaar={() => laad(huidigeMap)} mapId={huidigeMap} compact />
      </div>

      {deel && <DeelDialog doel={deel} initieelTab={deel.tab} onClose={() => setDeel(null)} onWijziging={() => laad(huidigeMap)} />}
      {verplaats && <VerplaatsDialog bestanden={verplaats} onClose={() => setVerplaats(null)} onKlaar={() => { setVerplaats(null); laad(huidigeMap) }} />}
    </div>
  )
}
