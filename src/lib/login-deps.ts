import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { LoginDeps } from '@/lib/login'
import { skipRateLimit } from '@/lib/rate-limit-mode'

type Admin = Pick<SupabaseClient<Database>, 'rpc'>

/**
 * The `loginWith` dependencies shared by the web action and the native login route: the same limiter RPC and account
 * lookup, only the sign-in differs (cookie client on web, a non-persisting client on mobile).
 */
export function loginDeps(
  admin: Admin,
  signIn: LoginDeps['signInWithPassword'],
  ip: string | null,
  skipLimit: (ip: string | null) => boolean = skipRateLimit,
): LoginDeps {
  return {
    async registerAttempt(keys) {
      if (skipLimit(ip)) return true
      const { data, error } = await admin.rpc('register_login_attempt', { p_keys: keys })
      // Fail closed: if the limiter is down nobody gets to try.
      return !error && data === true
    },
    async resolveAccount(id) {
      const { data, error } = await admin.rpc('account_for_login', { p_kind: id.kind, p_value: id.value })
      const row = error ? null : data?.[0]
      return row && row.user_id && row.email ? { userId: row.user_id, email: row.email } : null
    },
    signInWithPassword: signIn,
  }
}
