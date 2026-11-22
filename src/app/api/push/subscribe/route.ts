import { NextResponse } from 'next/server'
import { isAllowedPushEndpoint, parsePushSubscription } from '@/lib/push-endpoint'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function sessionUser() {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * Stores the caller's push subscription (user id from the session, endpoint on the push-service
 * allowlist). The browser sends the endpoint together with its private keys, which is our proof
 * of possession; if the endpoint was stored for ANOTHER user (shared device, logout without
 * cleanup) that row is deleted first, so a device only ever notifies the account using it.
 */
export async function POST(request: Request) {
  const uid = await sessionUser()
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = parsePushSubscription(await readJson(request))
  if (!parsed.ok) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const db = createAdminClient()
  const cleared = await db.from('push_subscriptions').delete().eq('endpoint', parsed.endpoint).neq('user_id', uid)
  if (cleared.error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  const { error } = await db
    .from('push_subscriptions')
    .upsert({ user_id: uid, endpoint: parsed.endpoint, p256dh: parsed.p256dh, auth: parsed.auth }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Removes the caller's own subscription for an endpoint (called on sign-out). */
export async function DELETE(request: Request) {
  const uid = await sessionUser()
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const endpoint = ((await readJson(request)) as { endpoint?: unknown } | null)?.endpoint
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', uid)
    .eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
