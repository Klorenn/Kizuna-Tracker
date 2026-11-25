/**
 * Pure building blocks for modal sheets (Sheet.tsx): which sheet is on top (only that one
 * answers Escape, the backdrop and Tab), a ref-counted body scroll lock, and the Tab trap.
 */

export function createModalStack() {
  const ids: number[] = []
  const closers = new Map<number, () => void>()
  let seq = 0
  return {
    /** `close` lets code outside the modal close it (the native app's back button): it must only close UI. */
    open(close?: () => void): number {
      const id = ++seq
      ids.push(id)
      if (close) closers.set(id, close)
      return id
    },
    close(id: number) {
      const i = ids.indexOf(id)
      if (i >= 0) ids.splice(i, 1)
      closers.delete(id)
    },
    hasOpen(): boolean {
      return ids.length > 0
    },
    isTop(id: number): boolean {
      return ids.length > 0 && ids[ids.length - 1] === id
    },
    /** Asks the top modal to close; true when there was one that can be closed. The modal removes itself via `close(id)`. */
    closeTop(): boolean {
      const top = ids[ids.length - 1]
      const fn = top === undefined ? undefined : closers.get(top)
      if (!fn) return false
      fn()
      return true
    },
  }
}

/**
 * Locks scrolling while at least one holder is open; returns an idempotent release.
 * `lock.reset()` is the safety net: it drops every holder and restores the page (a sheet that never got to release, e.g. the
 * page came back from the back/forward cache with the lock still set). Releases issued before a reset become no-ops.
 */
export function createScrollLock(style: () => { overflow: string }) {
  let count = 0
  let saved = ''
  let epoch = 0
  function lock(): () => void {
    if (count++ === 0) {
      const s = style()
      saved = s.overflow
      s.overflow = 'hidden'
    }
    let released = false
    const mine = epoch
    return () => {
      if (released || mine !== epoch) return
      released = true
      if (--count === 0) style().overflow = saved
    }
  }
  lock.reset = () => {
    if (count === 0) return
    count = 0
    epoch++
    style().overflow = saved
  }
  return lock
}

/**
 * Where Tab should land to stay inside the dialog: wraps at the ends, pulls focus back in
 * when it is outside (`active` not one of the items), null to let the browser move it.
 */
export function trapTarget<T>(items: T[], active: T | null, shift: boolean): T | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  if (active === null || !items.includes(active)) return shift ? last : first
  if (shift && active === first) return last
  if (!shift && active === last) return first
  return null
}
