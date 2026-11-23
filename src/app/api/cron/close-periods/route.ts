import { NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { closeDuePeriods, closeGroupWeeks } from '@/lib/close-periods'
import { createClosePeriodsRepo } from '@/lib/close-periods-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await authorizeCronRequest(request))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('close-periods failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }

  // Two independent halves: each runs whether or not the other fails. The response (status and body) is decided by the
  // challenge half alone, exactly as before; the group half only logs (closeGroupWeeks never throws, the catch is a backstop).
  let challenges: Awaited<ReturnType<typeof closeDuePeriods>> | null = null
  try {
    challenges = await closeDuePeriods(createClosePeriodsRepo(admin), new Date())
  } catch (e) {
    console.error('close-periods failed', e)
  }
  try {
    const groups = await closeGroupWeeks(admin)
    if ('closed' in groups && groups.closed > 0) console.log(`close-periods: closed ${groups.closed} group week(s)`)
  } catch (e) {
    console.error('close-periods: group weeks failed', e instanceof Error ? e.name : 'unknown')
  }

  if (!challenges) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json(challenges)
}
