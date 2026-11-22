import { NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/cron-auth'
import { notify, pushPendingNotifications } from '@/lib/notify'
import { dueReminders } from '@/lib/reminders'
import { alreadyReminded, loadReminderCandidates } from '@/lib/reminders-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const db = createAdminClient()
    const now = new Date()
    // 1) push notifications inserted by SQL (photo_rejected) or by the debts cron (new_debt)
    const swept = await pushPendingNotifications()
    // 2) daily reminders
    const due = dueReminders(await loadReminderCandidates(db, now), now)
    const skip = await alreadyReminded(db, due, now)
    const targets = due.filter((id) => !skip.has(id))
    await Promise.all(targets.map((id) => notify(id, 'reminder', {})))
    return NextResponse.json({ swept, reminded: targets.length })
  } catch (e) {
    console.error('reminders failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
