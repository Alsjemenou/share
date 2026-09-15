'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Sidebar from './Sidebar'

export type Gebruiker = {
  id: number
  gebruikersnaam: string
  weergavenaam: string
  email: string | null
  is_admin: number
  status: string
}

export type Merk = {
  naam: string | null
  subtitel: string | null
  kleur: string | null
  heeft_logo: boolean
  logo_id: number | null
}

const GebruikerCtx = createContext<{ gebruiker: Gebruiker | null; merk: Merk | null; herlaad: () => void }>({
  gebruiker: null,
  merk: null,
  herlaad: () => {},
})
export const useGebruiker = () => useContext(GebruikerCtx)

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [laden, setLaden] = useState(true)
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(null)
  const [merk, setMerk] = useState<Merk | null>(null)
  const [setup, setSetup] = useState(false)

  const herlaad = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me')
      const d = await r.json()
      setGebruiker(d.gebruiker)
      setMerk(d.merk || null)
      setSetup(!!d.setup)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { herlaad() }, [herlaad])

  if (laden) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Laden…</div>
  }

  if (!gebruiker) {
    return <AuthScherm setup={setup} onKlaar={herlaad} />
  }

  const merkStyle = merk?.kleur ? ({ ['--brand']: merk.kleur } as React.CSSProperties) : undefined

  return (
    <GebruikerCtx.Provider value={{ gebruiker, merk, herlaad }}>
      <div className={`flex h-screen w-full ${merk?.kleur ? 'merk' : ''}`} style={merkStyle}>
        <Sidebar />
        <main className="flex-1 overflow-auto px-4 pb-6 pt-16 md:p-8 min-w-0">
          {children}
        </main>
      </div>
    </GebruikerCtx.Provider>
  )
}

// ── Inlog- / setupscherm ────────────────────────────────────────────────────
function AuthScherm({ setup, onKlaar }: { setup: boolean; onKlaar: () => void }) {
  const [gebruikersnaam, setGebruikersnaam] = useState('')
  const [weergavenaam, setWeergavenaam] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState(false)

  async function verstuur(e: React.FormEvent) {
    e.preventDefault()
    setFout('')
    setBezig(true)
    try {
      const url = setup ? '/api/auth/setup' : '/api/auth/login'
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gebruikersnaam, weergavenaam, wachtwoord }),
      })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Er ging iets mis'); return }
      onKlaar()
    } catch {
      setFout('Kan geen verbinding maken')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📤</div>
          <h1 className="text-2xl font-bold text-amber-400">Deel</h1>
          <p className="text-sm text-gray-500 mt-1">Jouw eigen NAS &amp; WeTransfer</p>
        </div>

        <form onSubmit={verstuur} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">
            {setup ? 'Eerste account aanmaken' : 'Inloggen'}
          </h2>
          {setup && (
            <p className="text-xs text-gray-500 -mt-2">
              Dit wordt de beheerder (ziet alles). Daarna voeg je bij Beheer extra personen toe.
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Gebruikersnaam</label>
            <input
              value={gebruikersnaam}
              onChange={e => setGebruikersnaam(e.target.value)}
              autoComplete="username"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          {setup && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Weergavenaam</label>
              <input
                value={weergavenaam}
                onChange={e => setWeergavenaam(e.target.value)}
                placeholder="bijv. Joey"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Wachtwoord</label>
            <input
              type="password"
              value={wachtwoord}
              onChange={e => setWachtwoord(e.target.value)}
              autoComplete={setup ? 'new-password' : 'current-password'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          {fout && <div className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{fout}</div>}

          <button
            type="submit"
            disabled={bezig}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            {bezig ? 'Even geduld…' : setup ? 'Account aanmaken' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
