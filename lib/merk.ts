import { getDb } from '@/lib/db'

export type Merk = {
  naam: string | null
  subtitel: string | null
  kleur: string | null      // #rrggbb of null
  heeft_logo: boolean
  logo_id: number | null    // gebruiker-id om /api/merk/<id>/logo op te bouwen
}

// Strikte hex-validatie — voorkomt CSS-injectie wanneer de kleur in een inline
// style (--brand) terechtkomt. Alleen #rrggbb wordt geaccepteerd.
export function geldigeKleur(k: unknown): string | null {
  if (typeof k !== 'string') return null
  const s = k.trim()
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null
}

type Rij = { merk_naam: string | null; merk_subtitel: string | null; merk_kleur: string | null; merk_logo: string | null; mag_branding: number }

const LEEG: Merk = { naam: null, subtitel: null, kleur: null, heeft_logo: false, logo_id: null }

// Huisstijl van een gebruiker. Alleen toegepast als de gebruiker het recht
// 'mag_branding' heeft (door de beheerder toegekend) — anders een leeg merk,
// zodat het intrekken van het recht de branding overal laat verdwijnen.
export function haalMerk(gebruikerId: number): Merk {
  const db = getDb()
  const r = db.prepare('SELECT merk_naam, merk_subtitel, merk_kleur, merk_logo, mag_branding FROM gebruiker WHERE id = ?')
    .get(gebruikerId) as Rij | undefined
  if (!r || !r.mag_branding) return LEEG
  return {
    naam: r?.merk_naam || null,
    subtitel: r?.merk_subtitel || null,
    kleur: geldigeKleur(r?.merk_kleur) ,
    heeft_logo: !!r?.merk_logo,
    logo_id: r?.merk_logo ? gebruikerId : null,
  }
}

// Toegestane logo-types (GEEN svg — voorkomt script-uitvoering bij direct openen).
export const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
