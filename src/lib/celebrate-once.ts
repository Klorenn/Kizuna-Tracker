import { CAT_ASSETS, type CatAsset } from '@/lib/motion/cat-animation'

/** Extra time after the cat's single pass before a celebration sheet closes by itself. */
export const CELEBRATION_TAIL_MS = 500

export type CelebrationOnce = 'workout' | 'day' | 'meals'

/** One celebration per (kind, habit or "day", local date) per browser session. */
export function celebrationKey(kind: CelebrationOnce, scope: string, date: string): string {
  return `kizuna:celebrated:${kind}:${scope}:${date}`
}

type SessionLike = { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** True the first time a key is claimed in this session (undo then redo does not celebrate again). Storage errors never block a celebration. */
export function claimCelebration(storage: SessionLike | null, key: string): boolean {
  if (!storage) return true
  try {
    if (storage.getItem(key)) return false
    storage.setItem(key, '1')
    return true
  } catch {
    return true
  }
}

/** sessionStorage when the browser lets us use it. */
export function sessionStore(): SessionLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** One full pass of the cat plus a short tail. */
export function celebrationAutoCloseMs(asset: CatAsset): number {
  return CAT_ASSETS[asset].playMs + CELEBRATION_TAIL_MS
}

/** Claims (kind, scope, date) in this session's storage; true when it should celebrate. */
export function celebrateKeyAndClaim(kind: CelebrationOnce, scope: string, date: string): boolean {
  return claimCelebration(sessionStore(), celebrationKey(kind, scope, date))
}
