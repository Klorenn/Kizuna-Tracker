import { isNativeUA } from '@/lib/native-shell'

/** `type` of the one message the page posts to the app (mobile/src/web/policy.ts accepts exactly this shape). */
export const NATIVE_BACK_TYPE = 'kizuna.back'

type Win = { __kizunaBack?: unknown; ReactNativeWebView?: { postMessage(message: string): void } }

/**
 * The app's Android back button calls `window.__kizunaBack(id)` in the WebView. It closes the top sheet
 * (only UI: no data is read or written) and answers `{ t, id, handled }` through the WebView's channel, so the app
 * knows whether to go back in history instead. It exists only inside the native app (UA marker); a browser gets nothing.
 * Returns the cleanup.
 */
export function installNativeBack(win: object, userAgent: string, closeTop: () => boolean): () => void {
  if (!isNativeUA(userAgent)) return () => {}
  const w = win as Win
  const back = (id: unknown) => {
    if (typeof id !== 'number' || !Number.isSafeInteger(id)) return
    let handled = false
    try {
      handled = closeTop()
    } catch {
      handled = false
    }
    try {
      w.ReactNativeWebView?.postMessage(JSON.stringify({ t: NATIVE_BACK_TYPE, id, handled }))
    } catch {
      // no channel: the app falls back after its timeout
    }
  }
  w.__kizunaBack = back
  return () => {
    if (w.__kizunaBack === back) delete w.__kizunaBack
  }
}
