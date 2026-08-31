'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatDatum, formatDatumKort } from '@/lib/format'

type Props = { bestand: { id: number; originele_naam: string }; onClose: () => void; onWijziging?: () => void }

type Link = {
  id: number; token: string; verloopt_op: string | null; max_downloads: number | null
  download_count: number; actief: number; created_at: string; heeft_wachtwoord: number
}
type Account = {
  id: number; created_at: string; gebruiker_id: number; weergavenaam: string
  email: string | null; status: string; invite_token: string | null
}
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

export default function DeelDialog({ bestand, onClose, onWijziging }: Props) {
  const [tab, setTab] = useState<'link' | 'account' | 'downloads'>('link')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Delen</div>
            <div className="font-semibold truncate">{bestand.originele_naam}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">✕</button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {([['link', '🔗 Publieke link'], ['account', '👤 Naar account'], ['downloads', '📊 Downloads']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium ${tab === id ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'link' && <LinkTab bestandId={bestand.id} origin={origin} onWijziging={onWijziging} />}
          {tab === 'account' && <AccountTab bestandId={bestand.id} origin={origin} onWijziging={onWijziging} />}
          {tab === 'downloads' && <DownloadsTab bestandId={bestand.id} />}
        </div>
      </div>
    </div>
  )
}

// ── Publieke link ─────────────────────────────────────────────────────────────
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
      const r = await fetch('/api/deel/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestand_id: bestandId, wachtwoord: wachtwoord || undefined, verloop_dagen: Number(verloop) || undefined, max_downloads: maxDl || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Kon link niet maken'); return }
      setWachtwoord(''); setVerloop('0'); setMaxDl('')
      await laad(); onWijziging?.()
    } finally { setBezig(false) }
  }

  async function toggle(l: Link) {
    await fetch('/api/deel/link', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, actief: l.actief ? 0 : 1 }) })
    await laad(); onWijziging?.()
  }
  async function wis(l: Link) {
    if (!confirm('Deze link verwijderen? Bestaande links werken dan niet meer.')) return
    await fetch('/api/deel/link', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }) })
    await laad(); onWijziging?.()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-xs text-gray-400 mb-1">Wachtwoord (optioneel)</span>
          <input value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} placeholder="geen" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-gray-400 mb-1">Verloopt na</span>
          <select value={verloop} onChange={e => setVerloop(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="0">Nooit</option>
            <option value="1">1 dag</option>
            <option value="7">7 dagen</option>
            <option value="30">30 dagen</option>
            <option value="90">90 dagen</option>
          </select>
        </label>
        <label className="text-sm col-span-2">
          <span className="block text-xs text-gray-400 mb-1">Max. aantal downloads (optioneel)</span>
          <input value={maxDl} onChange={e => setMaxDl(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="onbeperkt" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>
      {fout && <div className="text-sm text-red-400">{fout}</div>}
      <button onClick={maak} disabled={bezig} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">
        {bezig ? 'Even geduld…' : 'Deel-link aanmaken'}
      </button>

      <div className="space-y-2 pt-2">
        {links.length === 0 && <div className="text-sm text-gray-500 text-center py-2">Nog geen links.</div>}
        {links.map(l => {
          const url = `${origin}/d/${l.token}`
          return (
            <div key={l.id} className={`bg-gray-800 rounded-xl p-3 ${l.actief ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <input readOnly value={url} className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs" onFocus={e => e.target.select()} />
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
    </div>
  )
}

// ── Naar account ────────────────────────────────────────────────────────────
function AccountTab({ bestandId, origin, onWijziging }: { bestandId: number; origin: string; onWijziging?: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ontvanger, setOntvanger] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [invite, setInvite] = useState<string>('')

  const laad = useCallback(async () => {
    const r = await fetch(`/api/deel/account?bestand=${bestandId}`)
    if (r.ok) setAccounts((await r.json()).accounts)
  }, [bestandId])
  useEffect(() => { laad() }, [laad])

  async function deel() {
    setBezig(true); setFout(''); setInvite('')
    try {
      const r = await fetch('/api/deel/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bestand_id: bestandId, ontvanger }),
      })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Kon niet delen'); return }
      setOntvanger('')
      if (d.uitnodiging?.token) setInvite(`${origin}/uitnodiging/${d.uitnodiging.token}`)
      await laad(); onWijziging?.()
    } finally { setBezig(false) }
  }

  async function wis(a: Account) {
    if (!confirm(`Deling met ${a.weergavenaam} intrekken?`)) return
    await fetch('/api/deel/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    await laad(); onWijziging?.()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm">
          <span className="block text-xs text-gray-400 mb-1">Naam of e-mailadres</span>
          <div className="flex gap-2">
            <input value={ontvanger} onChange={e => setOntvanger(e.target.value)} placeholder="bijv. anna@voorbeeld.nl" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" onKeyDown={e => { if (e.key === 'Enter' && ontvanger) deel() }} />
            <button onClick={deel} disabled={bezig || !ontvanger} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 text-sm">Deel</button>
          </div>
        </label>
        <p className="text-xs text-gray-500 mt-1">Bestaat er nog geen account? Dan maken we een uitnodiging aan die je zelf doorstuurt.</p>
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

      <div className="space-y-2 pt-1">
        {accounts.length === 0 && <div className="text-sm text-gray-500 text-center py-2">Nog met niemand gedeeld.</div>}
        {accounts.map(a => (
          <div key={a.id} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{a.weergavenaam}{a.email && a.email !== a.weergavenaam ? <span className="text-gray-500"> · {a.email}</span> : null}</div>
              <div className="text-xs text-gray-500">
                {a.status === 'uitgenodigd' ? '⏳ uitgenodigd (nog niet geaccepteerd)' : `✓ actief · sinds ${formatDatumKort(a.created_at)}`}
              </div>
              {a.status === 'uitgenodigd' && a.invite_token && (
                <div className="flex items-center gap-2 mt-1">
                  <input readOnly value={`${origin}/uitnodiging/${a.invite_token}`} className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-0.5 text-[11px]" onFocus={e => e.target.select()} />
                  <KopieerKnop tekst={`${origin}/uitnodiging/${a.invite_token}`} />
                </div>
              )}
            </div>
            <button onClick={() => wis(a)} className="text-xs text-gray-400 hover:text-red-300 underline whitespace-nowrap">Intrekken</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Downloads (tracking) ──────────────────────────────────────────────────────
function DownloadsTab({ bestandId }: { bestandId: number }) {
  const [logs, setLogs] = useState<Log[]>([])
  const [totaal, setTotaal] = useState(0)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/bestand/${bestandId}/downloads`)
      if (r.ok) { const d = await r.json(); setLogs(d.logs); setTotaal(d.totaal) }
      setLaden(false)
    })()
  }, [bestandId])

  if (laden) return <div className="text-sm text-gray-500 text-center py-4">Laden…</div>
  return (
    <div>
      <div className="text-sm mb-3">Totaal <b>{totaal}</b> download{totaal === 1 ? '' : 's'}.</div>
      {logs.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-2">Nog geen downloads.</div>
      ) : (
        <div className="space-y-1">
          {logs.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-gray-800 rounded-lg px-3 py-2">
              <span>{formatDatum(l.tijd)}</span>
              <span className="text-gray-400">
                {l.gebruiker_naam ? `👤 ${l.gebruiker_naam}` : l.deel_link_id ? '🔗 via link' : '—'}
                {l.ip ? ` · ${l.ip}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
