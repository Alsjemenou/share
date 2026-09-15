import { NextRequest, NextResponse } from 'next/server'
import { haalMerk } from '@/lib/merk'

export const runtime = 'nodejs'

// Publieke huisstijl van een gebruiker (naam/tagline/kleur/logo) — voor de
// download- en uitnodigingspagina's, zodat de ontvanger het merk van de deler ziet.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ merk: haalMerk(Number(id)) })
}
