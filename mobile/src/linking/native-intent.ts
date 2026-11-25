import { mapWebPath } from "../push/map-web-path";

/**
 * The app's intent filter is `kizuna://app/...` (host "app"), so it never matches the widget's own `kizuna://widget/pair`
 * (two activities with the same filter would pop a chooser). Expo Router reads the host as the first path segment, so
 * it is dropped here. The app is the web inside one WebView: the path after the host opens there
 * (`kizuna://app/habitos/1` -> `/?path=%2Fhabitos%2F1&n=...`), the bare host is home, an unsafe path goes home.
 */
const APP_HOST = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?app(\/.*)?$/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = APP_HOST.exec(path);
  if (!match) return path;
  const rest = match[1] ?? "/";
  return rest === "/" ? "/" : (mapWebPath(rest) ?? "/");
}
