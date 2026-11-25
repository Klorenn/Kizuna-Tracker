import { NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { notify, pushPendingNotifications } from '@/lib/notify'
import { checkPushReceipts, supabaseReceiptDeps } from '@/lib/push-receipts'
import { dueReminderEntries } from '@/lib/reminders'
import { claimReminders, loadReminderCandidates } from '@/lib/reminders-repo'
import { runScheduledNotifications } from '@/lib/scheduled-notifications'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!(await authorizeCronRequest(request))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const db = createAdminClient()
    const now = new Date()
    // 1) push notifications inserted by SQL (photo_rejected) or by the debts cron (new_debt)
    const swept = await pushPendingNotifications()
    // 2) daily reminders
    const due = dueReminderEntries(await loadReminderCandidates(db), now)
    const targets = await claimReminders(db, due) // once per user per local date
    for (let i = 0; i < targets.length; i += 10) {
      await Promise.all(targets.slice(i, i + 10).map((id) => notify(id, 'reminder', {})))
    }
    // 3) evening pushes: streak at risk (daily 20:00 local) and weekly summary (Sunday 21:00 local)
    const scheduled = await runScheduledNotifications(db, now)
    // 4) Expo receipts of the tickets sent 15+ minutes ago (dead tokens are deleted); never fails the cron
    const receipts = await checkPushReceipts(supabaseReceiptDeps(db)).catch((e) => {
      console.error('receipts failed', e)
      return null
    })
    // 5) retention of client_errors (30 days): one indexed delete; never fails the cron
    let purgedErrors: number | null = null
    try {
      const { data, error } = await db.rpc('purge_client_errors')
      purgedErrors = error ? null : data
    } catch (e) {
      console.error('client_errors purge failed', e)
    }
    return NextResponse.json({ swept, reminded: targets.length, ...scheduled, receipts, purgedErrors })
  } catch (e) {
    console.error('reminders failed', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
