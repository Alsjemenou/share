'use client'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useGebruiker } from '@/components/AuthGate'

export default function InstellingenPage() {
  const { gebruiker, herlaad } = useGebruiker()
  const { theme, setTheme } = useTheme()

  const [weergavenaam, setWeergavenaam] = useState(gebruiker?.weergavenaam || '')
  const [huidig, setHuidig] = useState('')
  const [nieuw, setNieuw] = useState('')
  const [melding, setMelding] = useState('')
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState(false)

  async function opslaan(e: React.FormEvent) {
    e.preventDefault()
    setBezig(true); setMelding(''); setFout('')
    try {
      const body: Record<string, string> = { weergavenaam }
      if (nieuw) { body.huidig_wachtwoord = huidig; body.nieuw_wachtwoord = nieuw }
      const r = await fetch('/api/profiel', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Er ging iets mis'); return }
      setMelding('Opgeslagen.'); setHuidig(''); setNieuw(''); herlaad()
    } finally { setBezig(false) }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Instellingen</h1>

      <form onSubmit={opslaan} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold">Profiel</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Weergavenaam</label>
          <input value={weergavenaam} onChange={e => setWeergavenaam(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Gebruikersnaam</label>
          <input value={gebruiker?.gebruikersnaam || ''} disabled className="w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500" />
        </div>

        <div className="pt-2 border-t border-gray-800">
          <h3 className="font-medium text-sm mb-2">Wachtwoord wijzigen</h3>
          <div className="space-y-3">
            <input type="password" value={huidig} onChange={e => setHuidig(e.target.value)} placeholder="Huidig wachtwoord" autoComplete="current-password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            <input type="password" value={nieuw} onChange={e => setNieuw(e.target.value)} placeholder="Nieuw wachtwoord (min. 6 tekens)" autoComplete="new-password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {melding && <div className="text-sm text-green-400">{melding}</div>}
        {fout && <div className="text-sm text-red-400">{fout}</div>}

        <button type="submit" disabled={bezig} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
        <h2 className="font-semibold mb-3">Weergave</h2>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`text-sm px-4 py-2 rounded-lg font-medium ${theme === t ? 'bg-amber-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {t === 'dark' ? '🌙 Donker' : t === 'light' ? '☀️ Licht' : '💻 Systeem'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
