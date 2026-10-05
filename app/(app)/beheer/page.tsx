'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DeelDialog from '@/components/DeelDialog'
import VerplaatsDialog from '@/components/VerplaatsDialog'
import { useGebruiker } from '@/components/AuthGate'
import { formatBytes, formatDatumKort, bestandIcoon } from '@/lib/format'

const TITELS: Record<string, string> = { bestanden: '📦 Alle bestanden', personen: '👥 Users', email: '✉️ E-mail', backup: '💾 Back-up' }

export default function BeheerPage() {
  return <Suspense fallback={null}><BeheerInner /></Suspense>
}

function BeheerInner() {
  const { gebruiker } = useGebruiker()
  const params = useSearchParams()
  const sectie = params.get('sectie') || 'bestanden'

  if (gebruiker && !gebruiker.is_admin) {
    return <div className="max-w-2xl mx-auto text-gray-500 py-10 text-center">Alleen voor beheerders.</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-5">{TITELS[sectie] || 'Beheer'}</h1>
      {sectie === 'bestanden' && <AlleBestanden />}
      {sectie === 'personen' && <Personen />}
      {sectie === 'email' && <EmailBeheer />}
      {sectie === 'backup' && <Backup />}
    </div>
  )
}

// ── Alle bestanden ────────────────────────────────────────────────────────────
type Bestand = { id: number; originele_naam: string; mime: string; grootte: number; created_at: string; eigenaar_id: number; eigenaar_naam: string; map_id: number | null; map_pad: string | null; aantal_links: number; aantal_accounts: number; downloads: number }
function AlleBestanden() {
  const [bestanden, setBestanden] = useState<Bestand[]>([])
  const [laden, setLaden] = useState(true)
  const [deel, setDeel] = useState<Bestand | null>(null)
  const [verplaats, setVerplaats] = useState<Bestand[] | null>(null)
  const [selectie, setSelectie] = useState<Set<number>>(new Set())

  const laad = useCallback(async () => {
    const r = await fetch('/api/bestanden?alle=1')
    if (r.ok) setBestanden((await r.json()).bestanden)
    setSelectie(new Set())
    setLaden(false)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function verwijder(b: Bestand) {
    if (!confirm(`"${b.originele_naam}" verwijderen?`)) return
    await fetch('/api/bestanden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id }) })
    laad()
  }
  function toggleSel(id: number) { setSelectie(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function verwijderSelectie() {
    if (!confirm(`${selectie.size} bestand${selectie.size === 1 ? '' : 'en'} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    await fetch('/api/bestanden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selectie] }) })
    laad()
  }

  if (laden) return <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
  if (bestanden.length === 0) return <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">Nog geen bestanden.</div>
  return (
    <div className="space-y-2">
      {selectie.size > 0 && (
        <div className="flex items-center gap-3 text-sm mb-1 flex-wrap">
          <span className="text-gray-400">{selectie.size} geselecteerd</span>
          <button onClick={() => { window.location.href = `/api/download-zip?ids=${[...selectie].join(',')}` }} className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium text-xs">⬇️ Download {selectie.size} als zip</button>
          <button onClick={() => setVerplaats(bestanden.filter(b => selectie.has(b.id)))} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium text-xs">↔️ Verplaats {selectie.size} naar map</button>
          <button onClick={verwijderSelectie} className="bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium text-xs">🗑️ Verwijder {selectie.size}</button>
          <button onClick={() => setSelectie(new Set())} className="text-gray-400 hover:text-white underline text-xs">Wis selectie</button>
        </div>
      )}
      {bestanden.map(b => (
        <div key={b.id} className={`bg-gray-900 border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${selectie.has(b.id) ? 'border-amber-500/60' : 'border-gray-800'}`}>
          <input type="checkbox" checked={selectie.has(b.id)} onChange={() => toggleSel(b.id)} className="shrink-0" />
          <span className="text-2xl shrink-0">{bestandIcoon(b.mime, b.originele_naam)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{b.originele_naam}</div>
            <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
              <span className="text-gray-300">👤 {b.eigenaar_naam}</span>
              <span className="text-amber-400/90">📁 {b.map_pad || 'hoofdmap'}</span>
              <span>{formatBytes(b.grootte)}</span><span>{formatDatumKort(b.created_at)}</span>
              {b.aantal_links > 0 && <span>🔗 {b.aantal_links}</span>}
              {b.downloads > 0 && <span>⬇️ {b.downloads}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
            <button onClick={() => setDeel(b)} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Delen</button>
            <button onClick={() => setVerplaats([b])} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Verplaats</button>
            <a href={`/api/bestand/${b.id}/download`} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Download</a>
            <button onClick={() => verwijder(b)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium">Verwijder</button>
          </div>
        </div>
      ))}
      {deel && <DeelDialog doel={{ soort: 'bestand', id: deel.id, naam: deel.originele_naam, mime: deel.mime }} onClose={() => setDeel(null)} onWijziging={laad} />}
      {verplaats && <VerplaatsDialog bestanden={verplaats} alleMappen onClose={() => setVerplaats(null)} onKlaar={() => { setVerplaats(null); laad() }} />}
    </div>
  )
}

// ── Personen ──────────────────────────────────────────────────────────────────
type Persoon = { id: number; gebruikersnaam: string; weergavenaam: string; email: string | null; is_admin: number; mag_branding: number; status: string; aantal_bestanden: number }
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
  async function toggleBranding(p: Persoon) {
    await fetch('/api/gebruikers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, mag_branding: p.mag_branding ? 0 : 1 }) })
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
                {p.mag_branding ? <span className="ml-2 text-[11px] bg-purple-500/20 text-purple-300 rounded px-1.5 py-0.5">huisstijl</span> : null}
                {p.status === 'uitgenodigd' ? <span className="ml-2 text-[11px] bg-gray-700 text-gray-300 rounded px-1.5 py-0.5">uitgenodigd</span> : null}
              </div>
              <div className="text-xs text-gray-500">{p.email || '—'} · {p.aantal_bestanden} bestand{p.aantal_bestanden === 1 ? '' : 'en'}</div>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <button onClick={() => reset(p)} className="text-gray-400 hover:text-white underline">Wachtwoord</button>
              <button onClick={() => toggleBranding(p)} className="text-gray-400 hover:text-white underline">{p.mag_branding ? 'Huisstijl uit' : 'Huisstijl aan'}</button>
              <button onClick={() => toggleAdmin(p)} className="text-gray-400 hover:text-white underline">{p.is_admin ? 'Geen beheer' : 'Beheer'}</button>
              {p.id !== gebruiker?.id && <button onClick={() => wis(p)} className="text-gray-400 hover:text-red-300 underline">Verwijder</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── E-mail ──────────────────────────────────────────────────────────────────────
const invoer = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-full'
function EmailBeheer() {
  const [cfg, setCfg] = useState({ mail_enabled: '0', mail_gmail_user: '', mail_gmail_wachtwoord: '', mail_afzender: 'Deel' })
  const [testNaar, setTestNaar] = useState('')
  const [melding, setMelding] = useState<{ t: string; ok: boolean } | null>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    fetch('/api/instellingen').then(r => r.json()).then(d => setCfg(c => ({ ...c, ...d, mail_gmail_wachtwoord: d.mail_gmail_wachtwoord === '__SET__' ? '__SET__' : '' })))
  }, [])

  async function opslaan() {
    setBezig(true); setMelding(null)
    const body: Record<string, string> = { mail_enabled: cfg.mail_enabled, mail_gmail_user: cfg.mail_gmail_user, mail_afzender: cfg.mail_afzender }
    if (cfg.mail_gmail_wachtwoord && cfg.mail_gmail_wachtwoord !== '__SET__') body.mail_gmail_wachtwoord = cfg.mail_gmail_wachtwoord
    const r = await fetch('/api/instellingen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setMelding(r.ok ? { t: 'Opgeslagen.', ok: true } : { t: 'Opslaan mislukte', ok: false })
    if (r.ok && cfg.mail_gmail_wachtwoord) setCfg(c => ({ ...c, mail_gmail_wachtwoord: '__SET__' }))
    setBezig(false)
  }
  async function testmail() {
    setBezig(true); setMelding(null)
    const r = await fetch('/api/instellingen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie: 'test-mail', naar: testNaar }) })
    const d = await r.json()
    setMelding(r.ok ? { t: `Testmail verstuurd naar ${d.naar}.`, ok: true } : { t: d.error || 'Versturen mislukte', ok: false })
    setBezig(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 max-w-lg">
      <div>
        <h2 className="font-semibold mb-1">E-mailnotificaties</h2>
        <p className="text-sm text-gray-500">Via Gmail (SMTP) met een <b>app-wachtwoord</b>. Bij delen naar een account krijgt de ontvanger automatisch bericht; nieuwe accounts krijgen hun activatielink gemaild. <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="text-amber-400 underline">App-wachtwoord aanmaken</a>.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.mail_enabled === '1'} onChange={e => setCfg({ ...cfg, mail_enabled: e.target.checked ? '1' : '0' })} />
        E-mailnotificaties aanzetten
      </label>
      <div className="space-y-2">
        <label className="block text-xs text-gray-400">Afzender-adres (Gmail)</label>
        <input value={cfg.mail_gmail_user} onChange={e => setCfg({ ...cfg, mail_gmail_user: e.target.value })} placeholder="jij@gmail.com" className={invoer} autoComplete="off" />
        <label className="block text-xs text-gray-400">App-wachtwoord</label>
        <input type="password" value={cfg.mail_gmail_wachtwoord === '__SET__' ? '' : cfg.mail_gmail_wachtwoord} onChange={e => setCfg({ ...cfg, mail_gmail_wachtwoord: e.target.value })} placeholder={cfg.mail_gmail_wachtwoord === '__SET__' ? '•••••••• (ingesteld — leeg laten = behouden)' : '16-cijferig app-wachtwoord'} className={invoer} autoComplete="new-password" />
        <label className="block text-xs text-gray-400">Afzendernaam</label>
        <input value={cfg.mail_afzender} onChange={e => setCfg({ ...cfg, mail_afzender: e.target.value })} placeholder="Deel" className={invoer} />
      </div>
      <button onClick={opslaan} disabled={bezig} className="bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-50">Opslaan</button>

      <div className="pt-4 border-t border-gray-800 space-y-2">
        <h3 className="font-medium text-sm">Testmail</h3>
        <div className="flex gap-2">
          <input value={testNaar} onChange={e => setTestNaar(e.target.value)} placeholder="ontvanger@voorbeeld.nl (leeg = jezelf)" className={invoer} />
          <button onClick={testmail} disabled={bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm shrink-0 disabled:opacity-50">Verstuur</button>
        </div>
      </div>
      {melding && <div className={`text-sm ${melding.ok ? 'text-emerald-400' : 'text-red-400'}`}>{melding.t}</div>}
    </div>
  )
}

// ── Back-up ───────────────────────────────────────────────────────────────────
const WEEKDAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
type SmbCfg = { server: string; share: string; pad: string; domein: string; gebruiker: string; wachtwoord: string; heeft_wachtwoord?: boolean; auto_enabled: boolean; auto_freq: 'dagelijks' | 'wekelijks'; auto_weekdag: number; bewaar_aantal: number; versleuteld?: boolean }
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
    <div className="space-y-5 max-w-lg">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold mb-1">Database back-up</h2>
          <p className="text-sm text-gray-500">
            Back-up bevat alleen de <b>applicatie-database</b> (accounts, bestand-gegevens, deel-links, instellingen). De <b>bestanden zelf</b> staan op de netwerkschijf en hebben hun eigen back-up.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/api/backup" className="inline-block bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm">💾 Nu downloaden</a>
          <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={e => { if (e.target.files?.[0]) herstel(e.target.files[0]); e.target.value = '' }} />
          <button onClick={() => inputRef.current?.click()} disabled={bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">{bezig ? 'Bezig…' : 'Uit bestand herstellen…'}</button>
        </div>
        {melding && <div className="text-sm text-amber-300">{melding}</div>}
      </div>

      <SmbBackup />
    </div>
  )
}

function SmbBackup() {
  const [cfg, setCfg] = useState<SmbCfg | null>(null)
  const [melding, setMelding] = useState<{ t: string; ok: boolean } | null>(null)
  const [bezig, setBezig] = useState('')
  const [backups, setBackups] = useState<string[] | null>(null)

  useEffect(() => { fetch('/api/backup/smb').then(r => r.json()).then(setCfg) }, [])
  if (!cfg) return <div className="text-gray-500 text-sm">Laden…</div>
  const set = (v: Partial<SmbCfg>) => setCfg({ ...cfg, ...v })

  async function opslaan() {
    setBezig('opslaan'); setMelding(null)
    const body = { ...cfg }
    if (cfg!.heeft_wachtwoord && !cfg!.wachtwoord) delete (body as Record<string, unknown>).wachtwoord // leeg = behouden
    const r = await fetch('/api/backup/smb', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setMelding(r.ok ? { t: 'Opgeslagen.', ok: true } : { t: 'Opslaan mislukte', ok: false })
    if (r.ok && cfg!.wachtwoord) setCfg({ ...cfg!, wachtwoord: '', heeft_wachtwoord: true })
    setBezig('')
  }
  async function actie(_actie: string, extra: Record<string, unknown> = {}) {
    setBezig(_actie); setMelding(null)
    const r = await fetch('/api/backup/smb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _actie, ...extra }) })
    const d = await r.json()
    if (_actie === 'lijst') { if (r.ok) setBackups(d.backups); else setMelding({ t: d.error || 'Ophalen mislukte', ok: false }) }
    else if (_actie === 'test') setMelding(r.ok ? { t: d.bericht || 'Verbinding OK', ok: true } : { t: d.error || 'Test mislukte', ok: false })
    else if (_actie === 'nu') setMelding(r.ok ? { t: `Back-up gemaakt: ${d.bestand}`, ok: true } : { t: d.error || 'Back-up mislukte', ok: false })
    else if (_actie === 'herstel') setMelding(r.ok ? { t: 'Hersteld. Log opnieuw in.', ok: true } : { t: d.error || 'Herstellen mislukte', ok: false })
    setBezig('')
  }
  async function herstelVersie(bestand: string) {
    if (!confirm(`De database wordt vervangen door back-up "${bestand}". Doorgaan?`)) return
    await actie('herstel', { bestand })
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Automatische back-up naar SMB-share</h2>
        <p className="text-sm text-gray-500">Zet de database periodiek weg op een netwerkshare. {cfg.versleuteld ? <span className="text-emerald-400">Back-ups worden versleuteld (AES-256).</span> : <span className="text-amber-400">Let op: BACKUP_ENC_KEY ontbreekt — back-ups zijn onversleuteld.</span>}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div><label className="block text-xs text-gray-400 mb-1">Server (IP/host)</label><input value={cfg.server} onChange={e => set({ server: e.target.value })} placeholder="192.168.2.205" className={invoer} /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Share</label><input value={cfg.share} onChange={e => set({ share: e.target.value })} placeholder="backups" className={invoer} /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Map (pad in share, optioneel)</label><input value={cfg.pad} onChange={e => set({ pad: e.target.value })} placeholder="deel" className={invoer} /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Domein/werkgroep</label><input value={cfg.domein} onChange={e => set({ domein: e.target.value })} placeholder="WORKGROUP" className={invoer} /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Gebruiker</label><input value={cfg.gebruiker} onChange={e => set({ gebruiker: e.target.value })} autoComplete="off" className={invoer} /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Wachtwoord</label><input type="password" value={cfg.wachtwoord} onChange={e => set({ wachtwoord: e.target.value })} placeholder={cfg.heeft_wachtwoord ? '•••••• (ingesteld)' : ''} autoComplete="new-password" className={invoer} /></div>
      </div>

      <div className="pt-3 border-t border-gray-800 grid sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={cfg.auto_enabled} onChange={e => set({ auto_enabled: e.target.checked })} />
          Automatische back-up aanzetten
        </label>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Frequentie</label>
          <select value={cfg.auto_freq} onChange={e => set({ auto_freq: e.target.value as 'dagelijks' | 'wekelijks' })} className={invoer}>
            <option value="dagelijks">Dagelijks</option>
            <option value="wekelijks">Wekelijks</option>
          </select>
        </div>
        {cfg.auto_freq === 'wekelijks' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Op welke dag</label>
            <select value={cfg.auto_weekdag} onChange={e => set({ auto_weekdag: Number(e.target.value) })} className={invoer}>
              {WEEKDAGEN.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Aantal versies bewaren</label>
          <input type="number" min={1} value={cfg.bewaar_aantal} onChange={e => set({ bewaar_aantal: Number(e.target.value) })} className={invoer} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap pt-1">
        <button onClick={opslaan} disabled={!!bezig} className="bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-50">{bezig === 'opslaan' ? 'Opslaan…' : 'Opslaan'}</button>
        <button onClick={() => actie('test')} disabled={!!bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{bezig === 'test' ? 'Testen…' : 'Verbinding testen'}</button>
        <button onClick={() => actie('nu')} disabled={!!bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{bezig === 'nu' ? 'Bezig…' : 'Nu back-uppen'}</button>
        <button onClick={() => actie('lijst')} disabled={!!bezig} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{bezig === 'lijst' ? 'Ophalen…' : 'Versies tonen'}</button>
      </div>

      {backups && (
        <div className="pt-3 border-t border-gray-800">
          <h3 className="font-medium text-sm mb-2">Back-ups op de share ({backups.length})</h3>
          {backups.length === 0 ? <p className="text-sm text-gray-500">Nog geen back-ups gevonden.</p> : (
            <div className="space-y-1">
              {backups.map(b => (
                <div key={b} className="flex items-center justify-between gap-3 bg-gray-800/60 rounded-lg px-3 py-2">
                  <span className="text-xs font-mono truncate">{b}</span>
                  <button onClick={() => herstelVersie(b)} disabled={!!bezig} className="text-xs bg-gray-700 hover:bg-amber-600 hover:text-white rounded px-2.5 py-1 shrink-0 disabled:opacity-50">Herstel</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {melding && <div className={`text-sm ${melding.ok ? 'text-emerald-400' : 'text-red-400'}`}>{melding.t}</div>}
    </div>
  )
}
