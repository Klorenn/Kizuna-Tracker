import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { closeDuePeriods } from '@/lib/close-periods'
import { createClosePeriodsRepo } from '@/lib/close-periods-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await closeDuePeriods(createClosePeriodsRepo(createAdminClient()), new Date())
    return NextResponse.json(result)
  } catch (e) {
    console.error('close-periods failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
