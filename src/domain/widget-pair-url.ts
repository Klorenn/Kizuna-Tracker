const PACKAGE = 'com.kizunatracker.app'
const FALLBACK = 'https://kizuna-tracker.vercel.app/perfil/ajustes#widget'

/** Explicit intent: URL (package set) that opens the widget setup activity with the code prefilled. */
export function widgetPairIntentUrl(code: string): string {
  return `intent://widget/pair?code=${encodeURIComponent(code)}#Intent;scheme=kizuna;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(FALLBACK)};end`
}
