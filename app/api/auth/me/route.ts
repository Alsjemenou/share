import { NextResponse } from 'next/server'
import { huidigeGebruiker, aantalGebruikers } from '@/lib/auth'
import { haalMerk } from '@/lib/merk'

// Vertelt de client wie er is ingelogd, of dat de app nog opgezet moet worden,
// plus de eigen huisstijl (branding) zodat de app die meteen kan toepassen.
export async function GET() {
  const setup = aantalGebruikers() === 0
  const gebruiker = await huidigeGebruiker()
  const merk = gebruiker ? haalMerk(gebruiker.id) : null
  return NextResponse.json({ gebruiker, setup, merk })
}
