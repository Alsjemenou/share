'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatDatum, formatDatumKort } from '@/lib/format'

export type DeelDoel = { soort: 'bestand' | 'map'; id: number; naam: string }
type Props = { doel: DeelDoel; onClose: () => void; onWijziging?: () => void; initieelTab?: 'delen' | 'link' | 'downloads' }

type Link = {
  id: number; token: string; verloopt_op: string | null; max_downloads: number | null
  download_count: number; actief: number; created_at: string; heeft_wachtwoord: number
}
type Account = { id: number; weergavenaam: string; email: string | null; status: string; invite_token: string | null }
type Groep = { id: number; naam: string; aantal_leden: number }
type MijnGroep = { id: number; naam: string; aantal_leden: number }
type Log = { tijd: string; ip: string | null; deel_link_id: number | null; gebruiker_naam: string | null }

function KopieerKnop({ tekst }: { tekst: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(tekst); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* nvt */ } }}
      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md px-2 py-1 whitespace-nowrap"
    >
      {ok ? '✓ Gekopieerd' : 'Kopieer'}
    </button>
  )
}

export default function DeelDialog({ doel, onClose, onWijziging, initieelTab }: Props) {
  const isBestand = doel.soort === 'bestand'
  const [tab, setTab] = useState<'delen' | 'link' | 'downloads'>(isBestand && initieelTab ? initieelTab : 'delen')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const tabs: [typeof tab, string][] = isBestand
    ? [['delen', '👥 Personen & groepen'], ['link', '🔗 Publieke link'], ['downloads', '📊 Downloads']]
    : [['delen', '👥 Personen & groepen']]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">{isBestand ? 'Bestand delen' : 'Map delen (incl. alles erin)'}</div>
            <div className="font-semibold truncate">{isBestand ? '' : '📂 '}{doel.naam}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">✕</button>
        </div>

        {tabs.length > 1 && (
          <div className="flex gap-1 px-4 pt-3">
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`text-sm px-3 py-1.5 rounded-lg font-medium ${tab === id ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{label}</button>
            ))}
          </div>
        )}

        <div className="p-5">
          {tab === 'delen' && <DelenTab doel={doel} origin={origin} onWijziging={onWijziging} />}
          {tab === 'link' && isBestand && <LinkTab bestandId={doel.id} origin={origin} onWijziging={onWijziging} />}
          {tab === 'downloads' && isBestand && <DownloadsTab bestandId={doel.id} />}
        </div>
      </div>
    </div>
  )
}

// ── Personen & groepen (werkt voor bestand én map) ────────────────────────────
function DelenTab({ doel, origin, onWijziging }: { doel: DeelDoel; origin: string; onWijziging?: () => void }) {
  const isBestand = doel.soort === 'bestand'
  const [accounts, setAccounts] = useState<Account[]>([])
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [mijnGroepen, setMijnGroepen] = useState<MijnGroep[]>([])
  const [ontvanger, setOntvanger] = useState('')
  const [kiesGroep, setKiesGroep] = useState('')
  const [invite, setInvite] = useState('')
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState(false)

  const laad = useCallback(async () => {
    const rg = await fetch('/api/groepen'); if (rg.ok) setMijnGroepen((await rg.json()).groepen)
    if (isBestand) {
      const ra = await fetch(`/api/deel/account?bestand=${doel.id}`); if (ra.ok) setAccounts((await ra.json()).accounts)
      const rgr = await fetch(`/api/deel/groep?bestand=${doel.id}`); if (rgr.ok) setGroepen((await rgr.json()).groepen)
    } else {
      const r = await fetch(`/api/deel/map?map=${doel.id}`)
      if (r.ok) { const d = await r.json(); setAccounts(d.accounts); setGroepen(d.groepen) }
    }
  }, [doel.id, isBestand])
  useEffect(() => { laad() }, [laad])

  async function deelPersoon() {
    if (!ontvanger.trim()) return
    setBezig(true); setFout(''); setInvite('')
    try {
      const url = isBestand ? '/api/deel/account' : '/api/deel/map'
      const body = isBestand ? { bestand_id: doel.id, ontvanger } : { map_id: doel.id, ontvanger }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Kon niet delen'); return }
      setOntvanger('')
      if (d.uitnodiging?.token) setInvite(`${origin}/uitnodiging/${d.uitnodiging.token}`)
      await laad(); onWijziging?.()
    } finally { setBezig(false) }
  }

  async function deelGroep() {
    const gid = Number(kiesGroep); if (!gid) return
    setBezig(true); setFout('')
    try {
      const url = isBestand ? '/api/deel/groep' : '/api/deel/map'
      const body = isBestand ? { bestand_id: doel.id, groep_id: gid } : { map_id: doel.id, groep_id: gid }
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { setFout((await r.json()).error || 'Kon niet delen'); return }
      setKiesGroep(''); await laad(); onWijziging?.()
    } finally { setBezig(false) }
  }

  async function wisAccount(id: number) {
    const url = isBestand ? '/api/deel/account' : '/api/deel/map'
    await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await laad(); onWijziging?.()
  }
  async function wisGroep(id: number) {
    const url = isBestand ? '/api/deel/groep' : '/api/deel/map'
    await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await laad(); onWijziging?.()
  }

  return (
    <div className="space-y-5">
      {/* Groep */}
      <div>
        <div className="text-xs text-gray-400 mb-1">Delen met een groep</div>
        {mijnGroepen.length === 0 ? (
          <p className="text-xs text-gray-500">Je hebt nog geen groepen. Maak er een aan bij <b>Groepen</b>.</p>
        ) : (
          <div className="flex gap-2">
            <select value={kiesGroep} onChange={e => setKiesGroep(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="">Kies een groep…</option>
              {mijnGroepen.map(gr => <option key={gr.id} value={gr.id}>{gr.naam} ({gr.aantal_leden})</option>)}
            </select>
            <button onClick={deelGroep} disabled={bezig || !kiesGroep} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 text-sm">Deel</button>
          </div>
        )}
      </div>

      {/* Persoon */}
      <div>
        <div className="text-xs text-gray-400 mb-1">Delen met een persoon (naam of e-mail)</div>
        <div className="flex gap-2">
          <input value={ontvanger} onChange={e => setOntvanger(e.target.value)} placeholder="bijv. anna@voorbeeld.nl" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" onKeyDown={e => { if (e.key === 'Enter') deelPersoon() }} />
          <button onClick={deelPersoon} disabled={bezig || !ontvanger} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 text-sm">Deel</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Nog geen account? Dan maken we een uitnodiging aan die je zelf doorstuurt.</p>
      </div>

      {fout && <div className="text-sm text-red-400">{fout}</div>}
      {invite && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3">
          <div className="text-xs text-amber-200 mb-2">📨 Uitnodigingslink — stuur deze naar de ontvanger:</div>
          <div className="flex items-center gap-2">
            <input readOnly value={invite} className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs" onFocus={e => e.target.select()} />
            <KopieerKnop tekst={invite} />
          </div>
        </div>
      )}

      {/* Gedeeld met */}
      <div className="pt-1">
        <div className="text-xs text-gray-400 mb-2">Gedeeld met</div>
        {groepen.length === 0 && accounts.length === 0 && <div className="text-sm text-gray-500 text-center py-2">Nog met niemand gedeeld.</div>}
        <div className="space-y-2">
          {groepen.map(gr => (
            <div key={`g${gr.id}`} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
              <span className="text-lg">👥</span>
              <div className="flex-1 min-w-0"><div className="text-sm truncate">{gr.naam}</div><div className="text-xs text-gray-500">groep · {gr.aantal_leden} lid{gr.aantal_leden === 1 ? '' : 'eren'}</div></div>
              <button onClick={() => wisGroep(gr.id)} className="text-xs text-gray-400 hover:text-red-300 underline">Intrekken</button>
            </div>
          ))}
          {accounts.map(a => (
            <div key={`a${a.id}`} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
              <span className="text-lg">👤</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{a.weergavenaam}{a.email && a.email !== a.weergavenaam ? <span className="text-gray-500"> · {a.email}</span> : null}</div>
                <div className="text-xs text-gray-500">{a.status === 'uitgenodigd' ? '⏳ uitgenodigd' : '✓ actief'}</div>
                {a.status === 'uitgenodigd' && a.invite_token && (
                  <div className="flex items-center gap-2 mt-1">
                    <input readOnly value={`${origin}/uitnodiging/${a.invite_token}`} className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-0.5 text-[11px]" onFocus={e => e.target.select()} />
                    <KopieerKnop tekst={`${origin}/uitnodiging/${a.invite_token}`} />
                  </div>
                )}
              </div>
              <button onClick={() => wisAccount(a.id)} className="text-xs text-gray-400 hover:text-red-300 underline">Intrekken</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Publieke link (alleen bestand) ────────────────────────────────────────────
function LinkTab({ bestandId, origin, onWijziging }: { bestandId: number; origin: string; onWijziging?: () => void }) {
  const [links, setLinks] = useState<Link[]>([])
  const [wachtwoord, setWachtwoord] = useState('')
  const [verloop, setVerloop] = useState('0')
  const [maxDl, setMaxDl] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  const laad = useCallback(async () => {
    const r = await fetch(`/api/deel/link?bestand=${bestandId}`)
    if (r.ok) setLinks((await r.json()).links)
  }, [bestandId])
  useEffect(() => { laad() }, [laad])

  async function maak() {
    setBezig(true); setFout('')
    try {
      const r = await fetch('/api/deel/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bestand_id: bestandId, wachtwoord: wachtwoord || undefined, verloop_dagen: Number(verloop) || undefined, max_downloads: maxDl || undefined }) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Kon link niet maken'); return }
      setWachtwoord(''); setVerloop('0'); setMaxDl(''); await laad(); onWijziging?.()
    } finally { setBezig(false) }
  }
  async function toggle(l: Link) { await fetch('/api/deel/link', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, actief: l.actief ? 0 : 1 }) }); await laad(); onWijziging?.() }
  async function wis(l: Link) { if (!confirm('Deze link verwijderen?')) return; await fetch('/api/deel/link', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }) }); await laad(); onWijziging?.() }

  const [toonNieuw, setToonNieuw] = useState(false)

  return (
    <div className="space-y-4">
      {/* Bestaande links — prominent, altijd terug te vinden via 'Delen' */}
      {links.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">Je deel-link{links.length === 1 ? '' : 's'} — kopieer of beheer deze wanneer je maar wilt:</div>
          {links.map(l => {
            const url = `${origin}/d/${l.token}`
            return (
              <div key={l.id} className={`bg-gray-800 rounded-xl p-3 ${l.actief ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input readOnly value={url} className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs" onFocus={e => e.target.select()} />
                  <KopieerKnop tekst={url} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                  <span>⬇️ {l.download_count}{l.max_downloads != null ? ` / ${l.max_downloads}` : ''}</span>
                  {l.heeft_wachtwoord ? <span>🔒 wachtwoord</span> : null}
                  {l.verloopt_op ? <span>⏳ tot {formatDatumKort(l.verloopt_op)}</span> : <span>♾️ geen verloop</span>}
                  {!l.actief && <span className="text-red-400">uitgeschakeld</span>}
                  <span className="ml-auto flex gap-2">
                    <button onClick={() => toggle(l)} className="hover:text-white underline">{l.actief ? 'Uit' : 'Aan'}</button>
                    <button onClick={() => wis(l)} className="hover:text-red-300 underline">Verwijder</button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-500 text-center py-1">Nog geen deel-link voor dit bestand.</div>
      )}

      {/* Nieuwe link maken (ingeklapt zodat bestaande links vooropstaan) */}
      {!toonNieuw && (
        <button onClick={() => setToonNieuw(true)} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm">＋ Nieuwe deel-link maken</button>
      )}
      {toonNieuw && (
        <div className="border border-gray-800 rounded-xl p-3 space-y-3">
          <div className="text-xs text-gray-400">Nieuwe deel-link</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="block text-xs text-gray-400 mb-1">Wachtwoord (optioneel)</span>
              <input value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} placeholder="geen" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="block text-xs text-gray-400 mb-1">Verloopt na</span>
              <select value={verloop} onChange={e => setVerloop(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="0">Nooit</option><option value="1">1 dag</option><option value="7">7 dagen</option><option value="30">30 dagen</option><option value="90">90 dagen</option>
              </select></label>
            <label className="text-sm col-span-2"><span className="block text-xs text-gray-400 mb-1">Max. aantal downloads (optioneel)</span>
              <input value={maxDl} onChange={e => setMaxDl(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="onbeperkt" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" /></label>
          </div>
          {fout && <div className="text-sm text-red-400">{fout}</div>}
          <div className="flex gap-2">
            <button onClick={async () => { await maak(); setToonNieuw(false) }} disabled={bezig} className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm">{bezig ? 'Even geduld…' : 'Link aanmaken'}</button>
            <button onClick={() => setToonNieuw(false)} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm">Annuleer</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Downloads (alleen bestand) ────────────────────────────────────────────────
function DownloadsTab({ bestandId }: { bestandId: number }) {
  const [logs, setLogs] = useState<Log[]>([])
  const [totaal, setTotaal] = useState(0)
  const [laden, setLaden] = useState(true)
  useEffect(() => { (async () => { const r = await fetch(`/api/bestand/${bestandId}/downloads`); if (r.ok) { const d = await r.json(); setLogs(d.logs); setTotaal(d.totaal) } setLaden(false) })() }, [bestandId])
  if (laden) return <div className="text-sm text-gray-500 text-center py-4">Laden…</div>
  return (
    <div>
      <div className="text-sm mb-3">Totaal <b>{totaal}</b> download{totaal === 1 ? '' : 's'}.</div>
      {logs.length === 0 ? <div className="text-sm text-gray-500 text-center py-2">Nog geen downloads.</div> : (
        <div className="space-y-1">
          {logs.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-2">
              <span>{formatDatum(l.tijd)}</span>
              <span className="text-gray-400">{l.gebruiker_naam ? `👤 ${l.gebruiker_naam}` : l.deel_link_id ? '🔗 via link' : '—'}{l.ip ? ` · ${l.ip}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
