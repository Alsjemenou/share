'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatDatumKort, bestandIcoon } from '@/lib/format'

type Link = { id: number; token: string; bestand_id: number; bestand_naam: string; mime: string; verloopt_op: string | null; max_downloads: number | null; download_count: number; actief: number; modus: string; heeft_wachtwoord: number }
type AccountShare = { id: number; bestand_naam: string; mime: string; ontvanger: string; ontvanger_status: string }
type GroepShare = { id: number; bestand_naam: string; mime: string; groep_naam: string; aantal_leden: number }
type MapShare = { id: number; map_id: number; map_naam: string; ontvanger_type: string; ontvanger: string; mag_uploaden: number; aantal_bestanden: number }

function KopieerKnop({ tekst }: { tekst: string }) {
  const [ok, setOk] = useState(false)
  return <button onClick={async () => { try { await navigator.clipboard.writeText(tekst); setOk(true); setTimeout(() => setOk(false), 1500) } catch {} }} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md px-2 py-1 whitespace-nowrap">{ok ? '✓ Gekopieerd' : 'Kopieer'}</button>
}

export default function GedeeldDoorMijPage() {
  const [links, setLinks] = useState<Link[]>([])
  const [accounts, setAccounts] = useState<AccountShare[]>([])
  const [groepen, setGroepen] = useState<GroepShare[]>([])
  const [mappen, setMappen] = useState<MapShare[]>([])
  const [laden, setLaden] = useState(true)
  const [beheer, setBeheer] = useState<Link | null>(null)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const laad = useCallback(async () => {
    const r = await fetch('/api/gedeeld-door-mij')
    if (r.ok) { const d = await r.json(); setLinks(d.links); setAccounts(d.accounts); setGroepen(d.groepen); setMappen(d.mappen) }
    setLaden(false)
  }, [])
  useEffect(() => { laad() }, [laad])

  async function stop(url: string, id: number, vraag: string) {
    if (!confirm(vraag)) return
    await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    laad()
  }

  const leeg = !laden && links.length === 0 && accounts.length === 0 && groepen.length === 0 && mappen.length === 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Gedeeld door mij</h1>
        <p className="text-sm text-gray-500 mt-1">Alles wat jij hebt gedeeld — snel terug te vinden en te beheren.</p>
      </div>

      {laden ? <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
      : leeg ? <div className="text-gray-500 text-sm py-10 text-center bg-gray-900 border border-gray-800 rounded-2xl">Je hebt nog niets gedeeld.</div>
      : (
        <div className="space-y-6">
          {/* Publieke links */}
          {links.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">🔗 Publieke links ({links.length})</h2>
              <div className="space-y-2">
                {links.map(l => (
                  <div key={l.id} className={`bg-gray-900 border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${l.actief ? 'border-gray-800' : 'border-gray-800 opacity-60'}`}>
                    <span className="text-2xl shrink-0">{bestandIcoon(l.mime, l.bestand_naam)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{l.bestand_naam}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                        {l.modus === 'preview' ? <span className="text-amber-400">🎧 alleen beluisteren</span> : <span>⬇️ {l.download_count}{l.max_downloads != null ? ` / ${l.max_downloads}` : ''}</span>}
                        {l.heeft_wachtwoord ? <span>🔒 wachtwoord</span> : null}
                        {l.verloopt_op ? <span>⏳ tot {formatDatumKort(l.verloopt_op)}</span> : <span>♾️ geen verloop</span>}
                        {!l.actief && <span className="text-red-400">uitgeschakeld</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
                      <KopieerKnop tekst={`${origin}/d/${l.token}`} />
                      <button onClick={() => setBeheer(l)} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium">Beheer</button>
                      <button onClick={() => stop('/api/deel/link', l.id, 'Deze link verwijderen? Hij werkt dan niet meer.')} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium">Stop delen</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Met personen */}
          {accounts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">👤 Met personen ({accounts.length})</h2>
              <div className="space-y-2">
                {accounts.map(a => (
                  <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-2xl shrink-0">{bestandIcoon(a.mime, a.bestand_naam)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{a.bestand_naam}</div>
                      <div className="text-xs text-gray-500">met <b className="text-gray-300">{a.ontvanger}</b>{a.ontvanger_status === 'uitgenodigd' ? ' · ⏳ uitgenodigd' : ''}</div>
                    </div>
                    <button onClick={() => stop('/api/deel/account', a.id, `Delen met ${a.ontvanger} intrekken?`)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium w-full sm:w-auto">Stop delen</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Met groepen */}
          {groepen.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">👥 Met groepen ({groepen.length})</h2>
              <div className="space-y-2">
                {groepen.map(gr => (
                  <div key={gr.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-2xl shrink-0">{bestandIcoon(gr.mime, gr.bestand_naam)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{gr.bestand_naam}</div>
                      <div className="text-xs text-gray-500">met groep <b className="text-gray-300">{gr.groep_naam}</b> · {gr.aantal_leden} lid{gr.aantal_leden === 1 ? '' : 'eren'}</div>
                    </div>
                    <button onClick={() => stop('/api/deel/groep', gr.id, `Delen met groep ${gr.groep_naam} intrekken?`)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium w-full sm:w-auto">Stop delen</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gedeelde mappen */}
          {mappen.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">📂 Gedeelde mappen ({mappen.length})</h2>
              <div className="space-y-2">
                {mappen.map(m => (
                  <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-2xl shrink-0">📂</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{m.map_naam} <span className="text-gray-500 font-normal">· {m.aantal_bestanden} bestand{m.aantal_bestanden === 1 ? '' : 'en'}</span></div>
                      <div className="text-xs text-gray-500">met {m.ontvanger_type === 'groep' ? 'groep' : ''} <b className="text-gray-300">{m.ontvanger}</b>{m.mag_uploaden ? <span className="text-amber-400"> · 🤝 teammap</span> : ' · alleen lezen'}</div>
                    </div>
                    <button onClick={() => stop('/api/deel/map', m.id, `Delen van map ${m.map_naam} intrekken?`)} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-3 py-1.5 font-medium w-full sm:w-auto">Stop delen</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {beheer && <LinkBeheer link={beheer} origin={origin} onClose={() => setBeheer(null)} onWijziging={laad} />}
    </div>
  )
}

// ── Popup: link beheren ───────────────────────────────────────────────────────
function LinkBeheer({ link, origin, onClose, onWijziging }: { link: Link; origin: string; onClose: () => void; onWijziging: () => void }) {
  const [l, setL] = useState(link)
  const [maxDl, setMaxDl] = useState(link.max_downloads != null ? String(link.max_downloads) : '')
  const [bezig, setBezig] = useState(false)

  async function patch(body: Record<string, unknown>) {
    setBezig(true)
    await fetch('/api/deel/link', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, ...body }) })
    // lokaal bijwerken voor directe feedback
    const r = await fetch('/api/gedeeld-door-mij'); if (r.ok) { const d = await r.json(); const ver = (d.links as Link[]).find(x => x.id === l.id); if (ver) setL(ver) }
    onWijziging(); setBezig(false)
  }

  const url = `${origin}/d/${l.token}`
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0"><div className="text-xs text-gray-500">Link beheren</div><div className="font-semibold truncate">{l.bestand_naam}</div></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs" onFocus={e => e.target.select()} />
            <KopieerKnop tekst={url} />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <button onClick={() => patch({ actief: l.actief ? 0 : 1 })} disabled={bezig} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${l.actief ? 'bg-green-600/20 text-green-300' : 'bg-gray-800 text-gray-400'}`}>{l.actief ? '✓ Actief — klik om uit te zetten' : 'Uitgeschakeld — klik om aan te zetten'}</button>
          </div>

          {l.modus !== 'preview' && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Downloads: {l.download_count}{l.max_downloads != null ? ` / ${l.max_downloads}` : ' (onbeperkt)'}</div>
              <div className="flex gap-2">
                <input value={maxDl} onChange={e => setMaxDl(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="onbeperkt" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
                <button onClick={() => patch({ max_downloads: maxDl || null })} disabled={bezig} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Max instellen</button>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-gray-400 mb-1">Verloop: {l.verloopt_op ? `tot ${formatDatumKort(l.verloopt_op)}` : 'geen'}</div>
            <div className="flex flex-wrap gap-1.5">
              {[7, 30, 90].map(d => <button key={d} onClick={() => patch({ verloop_dagen: d })} disabled={bezig} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">+{d} dagen (vanaf nu)</button>)}
              <button onClick={() => patch({ verloopt_op: null })} disabled={bezig} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 font-medium">Geen verloop</button>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 flex justify-between">
            <button onClick={async () => { if (!confirm('Deze link verwijderen?')) return; await fetch('/api/deel/link', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }) }); onWijziging(); onClose() }} className="text-xs bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg px-4 py-2 font-medium">Verwijderen</button>
            <button onClick={onClose} className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-4 py-2 font-medium">Klaar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
