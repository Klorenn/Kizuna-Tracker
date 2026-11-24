/**
 * The native app's WebView adds `KizunaNative/<version>` to its user agent (applicationNameForUserAgent). Inside it the web
 * hides what the app already provides: the bottom nav, the install prompt and the web-push prompts.
 */
export const NATIVE_UA_MARKER = 'KizunaNative'

const MARKER = new RegExp(`(?:^|\\s)${NATIVE_UA_MARKER}/\\d+`)

export function isNativeUA(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && MARKER.test(ua)
}

/** Header the app's WebView sends (source.headers) on the first load only. A victim's browser cannot be made to send it. */
export const NATIVE_HEADER = 'x-kizuna-native'

/** Both the UA marker and the custom header: the handoff signs a session in, so a browser must never be able to open it. */
export function isNativeRequest(headers: { get(name: string): string | null }): boolean {
  return isNativeUA(headers.get('user-agent')) && headers.get(NATIVE_HEADER) === '1'
}
