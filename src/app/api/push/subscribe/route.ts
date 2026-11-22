import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

/** Stores the caller's push subscription. The user id always comes from the session. */
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const { endpoint, keys } = body
  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    !endpoint.startsWith('https://') ||
    typeof keys?.p256dh !== 'string' ||
    typeof keys?.auth !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert({ user_id: data.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
