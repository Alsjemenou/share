'use client'
import { use, useEffect, useState } from 'react'
import { formatBytes, bestandIcoon } from '@/lib/format'

type Merk = { naam: string | null; subtitel: string | null; kleur: string | null; heeft_logo: boolean; logo_id: number | null; heeft_achtergrond: boolean; achtergrond_id: number | null }
type Meta = { naam: string; grootte: number; mime: string; heeft_wachtwoord: boolean; reden: string | null; grant: string | null; merk: Merk | null }

export default function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [grant, setGrant] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/download/${token}`)
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Deze link werkt niet.'); setLaden(false); return }
      setMeta(d)
      if (d.grant) setGrant(d.grant)
      setLaden(false)
    })()
  }, [token])

  async function ontgrendel(e: React.FormEvent) {
    e.preventDefault()
    setBezig(true); setFout('')
    try {
      const r = await fetch(`/api/download/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord }) })
      const d = await r.json()
      if (!r.ok) { setFout(d.error || 'Onjuist wachtwoord'); return }
      setGrant(d.grant)
    } finally { setBezig(false) }
  }

  const merk = meta?.merk || null
  const heeftMerk = !!(merk && (merk.naam || merk.heeft_logo || merk.kleur))
  const logoUrl = merk?.heeft_logo && merk.logo_id != null ? `/api/merk/${merk.logo_id}/logo` : null
  const achtergrondUrl = merk?.heeft_achtergrond && merk.achtergrond_id != null ? `/api/merk/${merk.achtergrond_id}/achtergrond` : null

  const Kaart = ({ children }: { children: React.ReactNode }) => (
    <div className={`relative z-10 w-full max-w-sm ${merk?.kleur ? 'merk' : ''} ${achtergrondUrl ? 'shadow-2xl self-start mr-auto' : ''}`} style={merk?.kleur ? ({ ['--brand']: merk.kleur } as React.CSSProperties) : undefined}>
      {heeftMerk ? (
        <div className="rounded-t-2xl px-5 py-4 flex items-center gap-3" style={{ backgroundColor: merk?.kleur || '#111827' }}>
          {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain rounded bg-white/20 p-0.5" /> : <span className="text-2xl">📤</span>}
          <div className="min-w-0">
            <div className="text-white font-bold truncate leading-tight">{merk?.naam || 'Deel'}</div>
            {merk?.subtitel && <div className="text-white/80 text-xs truncate">{merk.subtitel}</div>}
          </div>
        </div>
      ) : (
        <div className="text-center mb-5"><div className="text-4xl mb-2">📤</div><h1 className="text-xl font-bold text-amber-400">Deel</h1></div>
      )}
      <div className={`bg-gray-900 border border-gray-800 p-6 ${heeftMerk ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'}`}>{children}</div>
    </div>
  )

  let inner: React.ReactNode
  if (laden) inner = <Kaart><div className="text-center text-gray-500 text-sm py-4">Laden…</div></Kaart>
  else if (fout && !meta) inner = <Kaart><div className="text-center"><div className="text-3xl mb-2">🚫</div><div className="text-sm text-gray-300">{fout}</div></div></Kaart>
  else if (meta?.reden) inner = <Kaart><div className="text-center"><div className="text-3xl mb-2">⏳</div><div className="text-sm text-gray-300">{meta.reden}</div></div></Kaart>
  else inner = (
    <Kaart>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-4xl">{meta ? bestandIcoon(meta.mime, meta.naam) : '📦'}</span>
        <div className="min-w-0">
          <div className="font-medium truncate">{meta?.naam}</div>
          <div className="text-xs text-gray-500">{meta ? formatBytes(meta.grootte) : ''}</div>
        </div>
      </div>

      {grant ? (
        <a href={`/api/download/${token}/bestand?dl=${encodeURIComponent(grant)}`} className="block text-center bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-3 text-sm">⬇️ Downloaden</a>
      ) : (
        <form onSubmit={ontgrendel} className="space-y-3">
          <p className="text-sm text-gray-400">Dit bestand is beveiligd met een wachtwoord.</p>
          <input type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} placeholder="Wachtwoord" autoFocus className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          {fout && <div className="text-sm text-red-400">{fout}</div>}
          <button type="submit" disabled={bezig} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">{bezig ? 'Controleren…' : 'Ontgrendelen'}</button>
        </form>
      )}
      {heeftMerk && <div className="mt-4 text-center text-[11px] text-gray-600">Gedeeld via Deel</div>}
    </Kaart>
  )

  return (
    <>
      {achtergrondUrl && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img src={achtergrondUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/55" />
        </div>
      )}
      {inner}
    </>
  )
}
