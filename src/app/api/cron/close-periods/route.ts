import { NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { closeDuePeriods } from '@/lib/close-periods'
import { createClosePeriodsRepo } from '@/lib/close-periods-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await authorizeCronRequest(request))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await closeDuePeriods(createClosePeriodsRepo(createAdminClient()), new Date())
    return NextResponse.json(result)
  } catch (e) {
    console.error('close-periods failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
