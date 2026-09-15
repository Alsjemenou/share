'use client'
import { useEffect, useRef, useState } from 'react'
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

      {gebruiker?.mag_branding ? <Huisstijl onWijziging={herlaad} /> : null}
    </div>
  )
}

// ── Huisstijl (branding) ──────────────────────────────────────────────────────
type Merk = { naam: string | null; subtitel: string | null; kleur: string | null; heeft_logo: boolean; logo_id: number | null }

function Huisstijl({ onWijziging }: { onWijziging: () => void }) {
  const [naam, setNaam] = useState('')
  const [subtitel, setSubtitel] = useState('')
  const [kleur, setKleur] = useState('#f59e0b')
  const [merk, setMerk] = useState<Merk | null>(null)
  const [melding, setMelding] = useState('')
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)

  const laad = async () => {
    const r = await fetch('/api/merk')
    if (r.ok) {
      const m: Merk = (await r.json()).merk
      setMerk(m); setNaam(m.naam || ''); setSubtitel(m.subtitel || ''); setKleur(m.kleur || '#f59e0b')
    }
  }
  useEffect(() => { laad() }, [])

  async function opslaan() {
    setBezig(true); setMelding(''); setFout('')
    try {
      const r = await fetch('/api/merk', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam, subtitel, kleur }) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Opslaan mislukt'); return }
      setMerk(d.merk); setMelding('Huisstijl opgeslagen.'); onWijziging()
    } finally { setBezig(false) }
  }

  async function uploadLogo(file: File) {
    setBezig(true); setFout(''); setMelding('')
    const fd = new FormData(); fd.append('logo', file)
    const r = await fetch('/api/merk/logo', { method: 'POST', body: fd })
    const d = await r.json()
    if (!r.ok) { setFout(d.error || 'Upload mislukt') } else { setMerk(d.merk); setMelding('Logo bijgewerkt.'); onWijziging() }
    setBezig(false)
  }
  async function wisLogo() {
    const r = await fetch('/api/merk/logo', { method: 'DELETE' })
    if (r.ok) { setMerk((await r.json()).merk); onWijziging() }
  }

  const logoUrl = merk?.heeft_logo && merk.logo_id != null ? `/api/merk/${merk.logo_id}/logo?t=${Date.now()}` : null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-4">
      <h2 className="font-semibold mb-1">Huisstijl</h2>
      <p className="text-sm text-gray-500 mb-4">Je bedrijfsnaam, logo en accentkleur. Ontvangers van jouw deel-links en uitnodigingen zien deze stijl.</p>

      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm"><span className="block text-xs text-gray-400 mb-1">Bedrijfsnaam</span>
            <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. AudioRally" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" /></label>
          <label className="text-sm"><span className="block text-xs text-gray-400 mb-1">Tagline (optioneel)</span>
            <input value={subtitel} onChange={e => setSubtitel(e.target.value)} placeholder="bijv. Audio productions" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" /></label>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Accentkleur</span>
          <input type="color" value={kleur} onChange={e => setKleur(e.target.value)} className="h-9 w-14 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer" />
          <input value={kleur} onChange={e => setKleur(e.target.value)} className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-xs text-gray-500">wordt de accentkleur in plaats van oranje</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? <img src={logoUrl} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-2xl">🏢</span>}
          </div>
          <div className="text-sm">
            <div className="text-xs text-gray-400 mb-1">Logo (PNG/JPG/WEBP, max 2 MB)</div>
            <div className="flex gap-2">
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); e.target.value = '' }} />
              <button onClick={() => logoInput.current?.click()} disabled={bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Logo kiezen…</button>
              {merk?.heeft_logo && <button onClick={wisLogo} className="text-gray-400 hover:text-red-300 underline text-sm">Verwijderen</button>}
            </div>
          </div>
        </div>

        {/* Voorbeeld */}
        <div className="rounded-xl overflow-hidden border border-gray-700" style={{ ['--brand' as string]: kleur } as React.CSSProperties}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: kleur }}>
            {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded bg-white/20 p-0.5" /> : <span className="text-2xl">📤</span>}
            <div className="text-white font-bold">{naam || 'Jouw bedrijf'}</div>
          </div>
          <div className="p-4 bg-gray-800 text-sm text-gray-300">Zo ziet de kop van je downloadpagina eruit voor ontvangers.</div>
        </div>

        {melding && <div className="text-sm text-green-400">{melding}</div>}
        {fout && <div className="text-sm text-red-400">{fout}</div>}
        <button onClick={opslaan} disabled={bezig} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">{bezig ? 'Opslaan…' : 'Huisstijl opslaan'}</button>
      </div>
    </div>
  )
}
