'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import DeelDialog from '@/components/DeelDialog'
import { useGebruiker } from '@/components/AuthGate'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

export default function BeheerPage() {
  const { gebruiker } = useGebruiker()
  const [tab, setTab] = useState<'bestanden' | 'personen' | 'backup'>('bestanden')

  if (gebruiker && !gebruiker.is_admin) {
    return <div className="max-w-2xl mx-auto text-gray-500 py-10 text-center">Alleen voor beheerders.</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Beheer</h1>
      <div className="flex gap-1 mb-5">
        {([['bestanden', '📦 Alle bestanden'], ['personen', '👥 Personen'], ['backup', '💾 Back-up']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`text-sm px-3 py-1.5 rounded-lg font-medium ${tab === id ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{label}</button>
        ))}
      </div>
      {tab === 'bestanden' && <AlleBestanden />}
      {tab === 'personen' && <Personen />}
      {tab === 'backup' && <Backup />}
    </div>
  )
}

// ── Alle bestanden ────────────────────────────────────────────────────────────
type Bestand = { id: number; originele_naam: string; mime: string; grootte: number; created_at: string; eigenaar_naam: string; aantal_links: number; aantal_accounts: number; downloads: number }
function AlleBestanden() {
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)
  const [deel, setDeel] = useState<Bestand | null>(null)

  const laad = useCallback(async () => {
    const r = await fetch('/api/bestanden?alle=1')
    if (r.ok) setBestanden((await r.json()).bestanden)
    setLaden(false)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function verwijder(b: Bestand) {
    if (!confirm(`"${b.originele_naam}" verwijderen?`)) return
    await fetch('/api/bestanden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
    laad()
  }

  if (laden) return <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
  if (bestanden.length === 0) return <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">Nog geen bestanden.</div>
  return (
    <div className="space-y-2">
      {bestanden.map(b => (
        <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl shrink-0">{bestandIcoon(b.mime, b.originele_naam)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{b.originele_naam}</div>
            <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
              <span>👤 {b.eigenaar_naam}</span><span>{formatBytes(b.grootte)}</span><span>{formatDatumKort(b.created_at)}</span>
              {b.aantal_links > 0 && <span>🔗 {b.aantal_links}</span>}
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
      {deel && <DeelDialog doel={{ soort: 'bestand', id: deel.id, naam: deel.originele_naam }} onClose={() => setDeel(null)} onWijziging={laad} />}
    </div>
  )
}

// ── Personen ──────────────────────────────────────────────────────────────────
type Persoon = { id: number; gebruikersnaam: string; weergavenaam: string; email: string | null; is_admin: number; status: string; aantal_bestanden: number }
function Personen() {
  const { gebruiker } = useGebruiker()
  const [personen, setPersonen] = useState<Persoon[]>([])
  const [nieuw, setNieuw] = useState({ gebruikersnaam: '', weergavenaam: '', email: '', wachtwoord: '', is_admin: false })
  const [fout, setFout] = useState('')

  const laad = useCallback(async () => {
    const r = await fetch('/api/gebruikers')
    if (r.ok) setPersonen((await r.json()).gebruikers)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function voegToe(e: React.FormEvent) {
    e.preventDefault(); setFout('')
    const r = await fetch('/api/gebruikers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nieuw) })
    const d = await r.json()
    if (!r.ok) { setFout(d.error || 'Er ging iets mis'); return }
    setNieuw({ gebruikersnaam: '', weergavenaam: '', email: '', wachtwoord: '', is_admin: false })
    laad()
  }
  async function reset(p: Persoon) {
    const ww = prompt(`Nieuw wachtwoord voor ${p.weergavenaam} (min. 6 tekens):`)
    if (!ww) return
    const r = await fetch('/api/gebruikers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, nieuw_wachtwoord: ww }) })
    if (!r.ok) alert((await r.json()).error || 'Mislukt'); else laad()
  }
  async function toggleAdmin(p: Persoon) {
    await fetch('/api/gebruikers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, is_admin: p.is_admin ? 0 : 1 }) })
    laad()
  }
  async function wis(p: Persoon) {
    if (!confirm(`${p.weergavenaam} verwijderen? Alle bestanden van deze persoon worden ook verwijderd.`)) return
    const r = await fetch('/api/gebruikers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    if (!r.ok) alert((await r.json()).error || 'Mislukt'); else laad()
  }

  return (
    <div className="space-y-5">
      <form onSubmit={voegToe} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Nieuwe persoon</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={nieuw.gebruikersnaam} onChange={e => setNieuw({ ...nieuw, gebruikersnaam: e.target.value })} placeholder="Gebruikersnaam" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          <input value={nieuw.weergavenaam} onChange={e => setNieuw({ ...nieuw, weergavenaam: e.target.value })} placeholder="Weergavenaam" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          <input value={nieuw.email} onChange={e => setNieuw({ ...nieuw, email: e.target.value })} placeholder="E-mail (optioneel)" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={nieuw.wachtwoord} onChange={e => setNieuw({ ...nieuw, wachtwoord: e.target.value })} placeholder="Wachtwoord (min. 6)" autoComplete="new-password" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" checked={nieuw.is_admin} onChange={e => setNieuw({ ...nieuw, is_admin: e.target.checked })} /> Beheerder (ziet alles)
        </label>
        {fout && <div className="text-sm text-red-400">{fout}</div>}
        <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2 text-sm">Toevoegen</button>
      </form>

      <div className="space-y-2">
        {personen.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {p.weergavenaam} <span className="text-gray-500 font-normal">@{p.gebruikersnaam}</span>
                {p.is_admin ? <span className="ml-2 text-[11px] bg-amber-500/20 text-amber-300 rounded px-1.5 py-0.5">beheerder</span> : null}
                {p.status === 'uitgenodigd' ? <span className="ml-2 text-[11px] bg-gray-700 text-gray-300 rounded px-1.5 py-0.5">uitgenodigd</span> : null}
              </div>
              <div className="text-xs text-gray-500">{p.email || '—'} · {p.aantal_bestanden} bestand{p.aantal_bestanden === 1 ? '' : 'en'}</div>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <button onClick={() => reset(p)} className="text-gray-400 hover:text-white underline">Wachtwoord</button>
              <button onClick={() => toggleAdmin(p)} className="text-gray-400 hover:text-white underline">{p.is_admin ? 'Geen beheer' : 'Beheer'}</button>
              {p.id !== gebruiker?.id && <button onClick={() => wis(p)} className="text-gray-400 hover:text-red-300 underline">Verwijder</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Back-up ───────────────────────────────────────────────────────────────────
function Backup() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [melding, setMelding] = useState('')
  const [bezig, setBezig] = useState(false)

  async function herstel(file: File) {
    if (!confirm('De huidige database wordt vervangen door deze back-up. Doorgaan?')) return
    setBezig(true); setMelding('')
    const fd = new FormData(); fd.append('backup', file)
    const r = await fetch('/api/backup', { method: 'POST', body: fd })
    const d = await r.json()
    setMelding(r.ok ? 'Hersteld. Log opnieuw in.' : (d.error || 'Herstellen mislukte'))
    setBezig(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 max-w-lg">
      <div>
        <h2 className="font-semibold mb-1">Database back-up</h2>
        <p className="text-sm text-gray-500">
          Download een ZIP met alle accounts, bestand-gegevens en deel-links. De <b>bestanden zelf</b> (map <code className="text-gray-400">data/bestanden</code>) zitten hier niet in — die neem je mee in je gewone (versleutelde) back-up van de data-map.
        </p>
      </div>
      <a href="/api/backup" className="inline-block bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm">💾 Back-up downloaden</a>

      <div className="pt-4 border-t border-gray-800">
        <h3 className="font-medium text-sm mb-1">Herstellen</h3>
        <p className="text-sm text-gray-500 mb-2">Zet een eerder gedownloade back-up terug.</p>
        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={e => { if (e.target.files?.[0]) herstel(e.target.files[0]); e.target.value = '' }} />
        <button onClick={() => inputRef.current?.click()} disabled={bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">{bezig ? 'Bezig…' : 'Back-up kiezen…'}</button>
        {melding && <div className="text-sm mt-2 text-amber-300">{melding}</div>}
      </div>
    </div>
  )
}
