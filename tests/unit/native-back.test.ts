import { describe, expect, it, vi } from 'vitest'
import { installNativeBack, NATIVE_BACK_TYPE } from '@/lib/native-back'

const NATIVE_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 KizunaNative/1'
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36'

function fakeWindow(withBridge = true) {
  const posted: string[] = []
  const win: Record<string, unknown> = {}
  if (withBridge) win.ReactNativeWebView = { postMessage: (m: string) => posted.push(m) }
  return { win, posted }
}

describe('installNativeBack', () => {
  it('does nothing outside the native app (no UA marker): no global is created', () => {
    const { win } = fakeWindow()
    const off = installNativeBack(win, BROWSER_UA, () => true)
    expect(win.__kizunaBack).toBeUndefined()
    off()
  })

  it('exposes __kizunaBack in the native app and removes it on cleanup', () => {
    const { win } = fakeWindow()
    const off = installNativeBack(win, NATIVE_UA, () => true)
    expect(typeof win.__kizunaBack).toBe('function')
    off()
    expect(win.__kizunaBack).toBeUndefined()
  })

  it('closes the top sheet and replies with the same id and handled: true', () => {
    const { win, posted } = fakeWindow()
    const closeTop = vi.fn(() => true)
    installNativeBack(win, NATIVE_UA, closeTop)
    ;(win.__kizunaBack as (id: number) => void)(7)
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(posted.map((m) => JSON.parse(m))).toEqual([{ t: NATIVE_BACK_TYPE, id: 7, handled: true }])
  })

  it('replies handled: false when nothing is open', () => {
    const { win, posted } = fakeWindow()
    installNativeBack(win, NATIVE_UA, () => false)
    ;(win.__kizunaBack as (id: number) => void)(8)
    expect(JSON.parse(posted[0])).toEqual({ t: NATIVE_BACK_TYPE, id: 8, handled: false })
  })

  it('ignores a call with a bad id and never throws when there is no native channel', () => {
    const { win, posted } = fakeWindow()
    const closeTop = vi.fn(() => true)
    installNativeBack(win, NATIVE_UA, closeTop)
    const back = win.__kizunaBack as (id: unknown) => void
    back('x')
    back(undefined)
    back(1.5)
    expect(closeTop).not.toHaveBeenCalled()
    expect(posted).toEqual([])
    const bare = fakeWindow(false)
    installNativeBack(bare.win, NATIVE_UA, () => true)
    expect(() => (bare.win.__kizunaBack as (id: number) => void)(1)).not.toThrow()
  })

  it('a closer that throws counts as not handled', () => {
    const { win, posted } = fakeWindow()
    installNativeBack(win, NATIVE_UA, () => {
      throw new Error('boom')
    })
    ;(win.__kizunaBack as (id: number) => void)(3)
    expect(JSON.parse(posted[0])).toEqual({ t: NATIVE_BACK_TYPE, id: 3, handled: false })
  })
})
