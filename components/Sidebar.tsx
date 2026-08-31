'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGebruiker } from './AuthGate'

const NAV = [
  { href: '/', label: 'Mijn bestanden', icon: '📁' },
  { href: '/gedeeld', label: 'Gedeeld met mij', icon: '📥' },
  { href: '/groepen', label: 'Groepen', icon: '👥' },
  { href: '/instellingen', label: 'Instellingen', icon: '⚙️' },
]
const ADMIN_ITEM = { href: '/beheer', label: 'Beheer', icon: '🛡️' }

export default function Sidebar() {
  const pathname = usePathname()
  const { gebruiker } = useGebruiker()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  const items = gebruiker?.is_admin ? [...NAV.slice(0, 2), ADMIN_ITEM, ...NAV.slice(2)] : NAV
  const activeItem = items.find(n => n.href === '/' ? pathname === '/' : pathname.startsWith(n.href))

  async function uitloggen() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <>
      {/* ── Mobile topbar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 z-30 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Menu openen"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="2" rx="1" fill="currentColor" />
            <rect y="6" width="18" height="2" rx="1" fill="currentColor" />
            <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <span className="text-amber-400 font-bold text-sm">📤 Deel</span>
        {activeItem && (
          <span className="ml-auto text-xs text-gray-400 mr-1">{activeItem.icon} {activeItem.label}</span>
        )}
      </div>

      {/* ── Mobile overlay ── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
      )}

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
          <div>
            <div className="text-lg font-bold text-amber-400">📤 Deel</div>
            <div className="text-xs text-gray-500 mt-0.5">Bestanden delen</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Menu sluiten"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {items.map(n => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="px-2 py-1 text-sm">
            <div className="font-medium text-gray-200 truncate">{gebruiker?.weergavenaam}</div>
            <div className="text-xs text-gray-500 truncate">
              {gebruiker?.is_admin ? 'Beheerder' : 'Gebruiker'}
            </div>
          </div>
          <button
            onClick={uitloggen}
            className="mt-2 w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <span className="text-base">🚪</span>
            Uitloggen
          </button>
        </div>
      </aside>
    </>
  )
}
