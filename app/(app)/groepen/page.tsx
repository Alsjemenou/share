'use client'
import { useCallback, useEffect, useState } from 'react'

type Lid = { id: number; gebruiker_id: number; weergavenaam: string; email: string | null }
type Groep = { id: number; naam: string; aantal_leden: number; leden: Lid[] }
type Gebruiker = { id: number; weergavenaam: string; email: string | null }

export default function GroepenPage() {
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [gebruikers, setGebruikers] = useState<Gebruiker[]>([])
  const [nieuw, setNieuw] = useState('')
  const [laden, setLaden] = useState(true)

  const laad = useCallback(async () => {
    const [rg, ru] = await Promise.all([fetch('/api/groepen'), fetch('/api/gebruikers/kies')])
    if (rg.ok) setGroepen((await rg.json()).groepen)
    if (ru.ok) setGebruikers((await ru.json()).gebruikers)
    setLaden(false)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function maak(e: React.FormEvent) {
    e.preventDefault()
    if (!nieuw.trim()) return
    await fetch('/api/groepen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuw }) })
    setNieuw(''); laad()
  }
  async function hernoem(gr: Groep) {
    const naam = prompt('Nieuwe naam voor de groep:', gr.naam)
    if (!naam) return
    await fetch('/api/groepen', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gr.id, naam }) })
    laad()
  }
  async function wis(gr: Groep) {
    if (!confirm(`Groep "${gr.naam}" verwijderen? Bestanden die met deze groep gedeeld zijn, zijn dan niet meer zichtbaar voor de leden.`)) return
    await fetch('/api/groepen', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gr.id }) })
    laad()
  }
  async function voegLid(groepId: number, gebruikerId: number) {
    if (!gebruikerId) return
    await fetch('/api/groepen/lid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groep_id: groepId, gebruiker_id: gebruikerId }) })
    laad()
  }
  async function wisLid(groepId: number, gebruikerId: number) {
    await fetch('/api/groepen/lid', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groep_id: groepId, gebruiker_id: gebruikerId }) })
    laad()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Groepen</h1>
        <p className="text-sm text-gray-500 mt-1">Zet mensen in een groep en deel bestanden of hele mappen in één keer met het hele team.</p>
      </div>

      <form onSubmit={maak} className="flex gap-2 mb-5">
        <input value={nieuw} onChange={e => setNieuw(e.target.value)} placeholder="Naam van nieuwe groep (bijv. Team, Familie)" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 text-sm">Nieuwe groep</button>
      </form>

      {laden ? (
        <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
      ) : groepen.length === 0 ? (
        <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">Nog geen groepen. Maak er hierboven een aan.</div>
      ) : (
        <div className="space-y-3">
          {groepen.map(gr => (
            <div key={gr.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">👥</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{gr.naam}</div>
                  <div className="text-xs text-gray-500">{gr.aantal_leden} lid{gr.aantal_leden === 1 ? '' : 'eren'}</div>
                </div>
                <button onClick={() => hernoem(gr)} className="text-xs text-gray-400 hover:text-white underline">Hernoem</button>
                <button onClick={() => wis(gr)} className="text-xs text-gray-400 hover:text-red-300 underline">Verwijder</button>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {gr.leden.length === 0 && <span className="text-xs text-gray-500">Nog geen leden.</span>}
                {gr.leden.map(l => (
                  <span key={l.id} className="inline-flex items-center gap-1.5 bg-gray-800 rounded-full pl-3 pr-1.5 py-1 text-xs">
                    {l.weergavenaam}
                    <button onClick={() => wisLid(gr.id, l.gebruiker_id)} className="w-4 h-4 rounded-full bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white leading-none" title="Verwijderen">×</button>
                  </span>
                ))}
              </div>

              <LidToevoegen
                gebruikers={gebruikers.filter(u => !gr.leden.some(l => l.gebruiker_id === u.id))}
                onKies={id => voegLid(gr.id, id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LidToevoegen({ gebruikers, onKies }: { gebruikers: Gebruiker[]; onKies: (id: number) => void }) {
  const [val, setVal] = useState('')
  if (gebruikers.length === 0) return <div className="text-xs text-gray-500">Iedereen zit al in deze groep.</div>
  return (
    <select
      value={val}
      onChange={e => { const id = Number(e.target.value); if (id) { onKies(id); setVal('') } }}
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
    >
      <option value="">+ Lid toevoegen…</option>
      {gebruikers.map(u => <option key={u.id} value={u.id}>{u.weergavenaam}{u.email ? ` (${u.email})` : ''}</option>)}
    </select>
  )
}
