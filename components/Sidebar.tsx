'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGebruiker } from './AuthGate'

type Kind = { label: string; path: string; sectie: string | null; brandingOnly?: boolean }
type Item = { label: string; icon: string; href?: string; adminOnly?: boolean; kinderen?: Kind[] }

const MENU: Item[] = [
  { href: '/', label: 'Mijn bestanden', icon: '📁' },
  { href: '/gedeeld', label: 'Gedeeld met mij', icon: '📥' },
  {
    label: 'Beheer', icon: '🛡️', adminOnly: true, kinderen: [
      { label: 'Alle bestanden', path: '/beheer', sectie: 'bestanden' },
      { label: 'Users', path: '/beheer', sectie: 'personen' },
      { label: 'Groeps', path: '/groepen', sectie: null },
      { label: 'Back-up', path: '/beheer', sectie: 'backup' },
    ],
  },
  {
    label: 'Instellingen', icon: '⚙️', kinderen: [
      { label: 'Profiel + Weergave', path: '/instellingen', sectie: 'profiel' },
      { label: 'Huisstijl', path: '/instellingen', sectie: 'huisstijl', brandingOnly: true },
    ],
  },
]

const DEFAULT_SECTIE: Record<string, string> = { '/beheer': 'bestanden', '/instellingen': 'profiel' }

export default function Sidebar() {
  const pathname = usePathname()
  const params = useSearchParams()
  const curSectie = params.get('sectie')
  const { gebruiker, merk } = useGebruiker()
  const [open, setOpen] = useState(false)

  const merkNaam = merk?.naam || 'Deel'
  const merkSub = merk?.subtitel || 'Bestanden delen'
  const logo = merk?.heeft_logo && merk.logo_id != null ? `/api/merk/${merk.logo_id}/logo` : null

  useEffect(() => { setOpen(false) }, [pathname, curSectie])

  const items = MENU.filter(i => !i.adminOnly || gebruiker?.is_admin)

  const kindHref = (k: Kind) => k.path + (k.sectie ? `?sectie=${k.sectie}` : '')
  const kindActief = (k: Kind) => {
    if (pathname !== k.path) return false
    if (k.sectie == null) return true
    return (curSectie || DEFAULT_SECTIE[k.path]) === k.sectie
  }
  const zichtbareKinderen = (item: Item) => (item.kinderen || []).filter(k => !k.brandingOnly || gebruiker?.mag_branding)
  const itemActief = (item: Item) =>
    item.href ? (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) : (item.kinderen?.some(k => pathname === k.path) ?? false)

  // Label voor de mobiele topbar.
  let huidigeLabel = ''
  for (const item of items) {
    if (itemActief(item)) {
      if (item.href) huidigeLabel = `${item.icon} ${item.label}`
      else { const k = zichtbareKinderen(item).find(kindActief); huidigeLabel = k ? `${item.label} · ${k.label}` : `${item.icon} ${item.label}` }
    }
  }

  async function uitloggen() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <>
      {/* ── Mobile topbar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 z-30 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-3">
        <button onClick={() => setOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors" aria-label="Menu openen">
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="2" rx="1" fill="currentColor" />
            <rect y="6" width="18" height="2" rx="1" fill="currentColor" />
            <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <span className="flex items-center gap-1.5 text-amber-400 font-bold text-sm min-w-0">
          {logo ? <img src={logo} alt="" className="h-5 w-5 object-contain rounded" /> : <span>📤</span>}
          <span className="truncate">{merkNaam}</span>
        </span>
        {huidigeLabel && <span className="ml-auto text-xs text-gray-400 mr-1 truncate max-w-[55%]">{huidigeLabel}</span>}
      </div>

      {/* ── Mobile overlay ── */}
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />}

      {/* ── Sidebar panel ── */}
      <aside
        className={[
          'flex flex-col bg-gray-900 border-r border-gray-800',
          'fixed inset-y-0 left-0 z-50 w-64',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:static md:w-52 md:translate-x-0 md:shrink-0',
        ].join(' ')}
      >
        <div className="px-5 py-5 border-b border-gray-800 flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2">
            {logo ? <img src={logo} alt="" className="h-8 w-8 object-contain rounded shrink-0" /> : <span className="text-lg">📤</span>}
            <div className="min-w-0">
              <div className="text-lg font-bold text-amber-400 truncate leading-tight">{merkNaam}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{merkSub}</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800" aria-label="Menu sluiten">✕</button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {items.map(item => {
            if (!item.kinderen) {
              const active = itemActief(item)
              return (
                <Link key={item.href} href={item.href!} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              )
            }
            const kinderen = zichtbareKinderen(item)
            return (
              <div key={item.label} className="pt-1">
                <Link href={kindHref(kinderen[0])} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${itemActief(item) ? 'text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}>
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
                <div className="ml-4 mt-0.5 border-l border-gray-800 pl-2 space-y-0.5">
                  {kinderen.map(k => (
                    <Link key={k.label} href={kindHref(k)} className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${kindActief(k) ? 'bg-amber-500 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                      {k.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="px-2 py-1 text-sm">
            <div className="font-medium text-gray-200 truncate">{gebruiker?.weergavenaam}</div>
            <div className="text-xs text-gray-500 truncate">{gebruiker?.is_admin ? 'Beheerder' : 'Gebruiker'}</div>
          </div>
          <button onClick={uitloggen} className="mt-2 w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <span className="text-base">🚪</span>
            Uitloggen
          </button>
        </div>
      </aside>
    </>
  )
}
