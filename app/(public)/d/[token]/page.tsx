'use client'
import { use, useEffect, useState } from 'react'
import { formatBytes, bestandIcoon } from '@/lib/format'

type Meta = { naam: string; grootte: number; mime: string; heeft_wachtwoord: boolean; reden: string | null; grant: string | null }

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

  if (fout && !meta) return <Kaart><div className="text-center"><div className="text-3xl mb-2">🚫</div><div className="text-sm text-gray-300">{fout}</div></div></Kaart>

  if (meta?.reden) return <Kaart><div className="text-center"><div className="text-3xl mb-2">⏳</div><div className="text-sm text-gray-300">{meta.reden}</div></div></Kaart>

  return (
    <Kaart>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-4xl">{meta ? bestandIcoon(meta.mime, meta.naam) : '📦'}</span>
        <div className="min-w-0">
          <div className="font-medium truncate">{meta?.naam}</div>
          <div className="text-xs text-gray-500">{meta ? formatBytes(meta.grootte) : ''}</div>
        </div>
      </div>

      {grant ? (
        <a
          href={`/api/download/${token}/bestand?dl=${encodeURIComponent(grant)}`}
          className="block text-center bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg px-4 py-3 text-sm"
        >
          ⬇️ Downloaden
        </a>
      ) : (
        <form onSubmit={ontgrendel} className="space-y-3">
          <p className="text-sm text-gray-400">Dit bestand is beveiligd met een wachtwoord.</p>
          <input type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)} placeholder="Wachtwoord" autoFocus className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          {fout && <div className="text-sm text-red-400">{fout}</div>}
          <button type="submit" disabled={bezig} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm">
            {bezig ? 'Controleren…' : 'Ontgrendelen'}
          </button>
        </form>
      )}
    </Kaart>
  )
}
