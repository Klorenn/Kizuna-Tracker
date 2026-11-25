/** Errors that say nothing about our code. Used by the client before sending and again by the server. */
const EXTENSION = /(?:chrome|moz|safari|safari-web)-extension:\/\//
const RESIZE = /ResizeObserver loop/i
const ABORT = /AbortError|aborted a request|signal is aborted|operation was aborted|request was aborted/i
const OPAQUE = /^Script error\.?$/i
const NAV_NETWORK = /^(?:TypeError: )?(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/i

export function isNoise(e: { message: string; stack?: string | null; navigating?: boolean }): boolean {
  const msg = e.message.trim()
  if (EXTENSION.test(e.stack ?? '') || EXTENSION.test(msg)) return true
  if (RESIZE.test(msg) || ABORT.test(msg) || OPAQUE.test(msg)) return true
  return e.navigating === true && NAV_NETWORK.test(msg)
}
