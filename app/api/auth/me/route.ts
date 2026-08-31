import { NextResponse } from 'next/server'
import { huidigeGebruiker, aantalGebruikers } from '@/lib/auth'

// Vertelt de client wie er is ingelogd, of dat de app nog opgezet moet worden.
export async function GET() {
  const setup = aantalGebruikers() === 0
  const gebruiker = await huidigeGebruiker()
  return NextResponse.json({ gebruiker, setup })
}
