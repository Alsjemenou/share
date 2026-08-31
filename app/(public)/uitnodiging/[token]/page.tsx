'use client'
import { use, useEffect, useState } from 'react'

type Info = { gebruikersnaam: string; weergavenaam: string; aantal_bestanden: number }

export default function UitnodigingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [info, setInfo] = useState<Info | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState('')
  const [weergavenaam, setWeergavenaam] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/uitnodiging/${token}`)
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Deze uitnodiging werkt niet.'); setLaden(false); return }
      setInfo(d); setWeergavenaam(d.weergavenaam || '')
      setLaden(false)
    })()
  }, [token])

  async function accepteer(e: React.FormEvent) {
    e.preventDefault()
    setBezig(true); setFout('')
    try {
      const r = await fetch(`/api/uitnodiging/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord, weergavenaam }) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Er ging iets mis'); return }
      setKlaar(true)
      window.location.href = '/gedeeld'
    } finally { setBezig(false) }
  }

  const Kaart = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full max-w-sm">
      <div className="text-center mb-5">
        <div className="text-4xl mb-2">📤</div>
        <h1 className="text-xl font-bold text-amber-400">Deel</h1>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">{children}</div>
    </div>
  )

  if (laden) return <Kaart><div className="text-center text-gray-500 text-sm py-4">Laden…</div></Kaart>
  if (fout && !info) return <Kaart><div className="text-center"><div className="text-3xl mb-2">🚫</div><div className="text-sm text-gray-300">{fout}</div></div></Kaart>
  if (klaar) return <Kaart><div className="text-center text-sm text-gray-300 py-4">Welkom! Je wordt doorgestuurd…</div></Kaart>

  return (
    <Kaart>
      <h2 className="font-semibold mb-1">Je bent uitgenodigd</h2>
      <p className="text-sm text-gray-400 mb-4">
        Er {info && info.aantal_bestanden === 1 ? 'is 1 bestand' : `zijn ${info?.aantal_bestanden} bestanden`} met je gedeeld.
        Kies een wachtwoord om je account te activeren.
      </p>
      <form onSubmit={accepteer} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Je naam</label>
          <input value={weergavenaam} onChange={e => setWeergavenaam(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Inlognaam</label>
          <input value={info?.gebruikersnaam || ''} disabled className="w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Kies een wachtwoord</label>
          <input type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} placeholder="min. 6 tekens" autoComplete="new-password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        {fout && <div className="text-sm text-red-400">{fout}</div>}
        <button type="submit" disabled={bezig} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">
          {bezig ? 'Even geduld…' : 'Account activeren'}
        </button>
      </form>
    </Kaart>
  )
}
