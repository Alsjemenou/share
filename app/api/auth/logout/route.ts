import { NextResponse } from 'next/server'
import { wisSessieCookie } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  wisSessieCookie(res)
  return res
}
