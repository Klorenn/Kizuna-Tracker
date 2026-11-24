/**
 * The native app's WebView adds `KizunaNative/<version>` to its user agent (applicationNameForUserAgent). Inside it the web
 * hides what the app already provides: the bottom nav, the install prompt and the web-push prompts.
 */
export const NATIVE_UA_MARKER = 'KizunaNative'

const MARKER = new RegExp(`(?:^|\\s)${NATIVE_UA_MARKER}/\\d+`)

export function isNativeUA(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && MARKER.test(ua)
}
