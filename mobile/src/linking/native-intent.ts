/**
 * The app's intent filter is `kizuna://app/...` (host "app"), so it never matches the widget's own `kizuna://widget/pair`
 * (two activities with the same filter would pop a chooser). Expo Router reads the host as the first path segment, so
 * it is dropped here: `kizuna://app/habitos/1` -> `/habitos/1`.
 */
const APP_HOST = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?app(\/.*)?$/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = APP_HOST.exec(path);
  return match ? (match[1] ?? "/") : path;
}
