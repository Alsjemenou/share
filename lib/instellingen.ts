import { getDb } from '@/lib/db'

// Kleine helpers rond de key/value-tabel `instellingen` (Beheer-brede settings).
export function leesInstelling(sleutel: string, standaard = ''): string {
  const db = getDb()
  const r = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel) as { waarde: string } | undefined
  return r?.waarde ?? standaard
}

export function zetInstelling(sleutel: string, waarde: string): void {
  getDb().prepare('INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES (?, ?)').run(sleutel, String(waarde))
}
