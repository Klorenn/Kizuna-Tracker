import { useEffect, useState } from "react";
import { WebView } from "react-native-webview";

/**
 * Android shares one CookieManager between every WebView and an `incognito` WebView clears all of its cookies when it opens
 * (react-native-webview: setIncognito -> removeAllCookies). That is how logout removes the web session without another native
 * package: a hidden incognito WebView is mounted for one load. Resolves on its load end, or after a timeout (never hangs).
 */
const TIMEOUT_MS = 2000;
const listeners = new Set<(finish: () => void) => void>();

export function wipeWebSession(): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    setTimeout(finish, TIMEOUT_MS);
    listeners.forEach((l) => l(finish));
  });
}

/** Mounted once at the root: renders the hidden WebView only while a wipe is running. */
export function WebSessionWiper() {
  const [finish, setFinish] = useState<(() => void) | null>(null);
  useEffect(() => {
    const listener = (f: () => void) => setFinish(() => f);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  if (!finish) return null;
  return (
    <WebView
      incognito
      source={{ html: "<html></html>" }}
      originWhitelist={["about:*"]}
      javaScriptEnabled={false}
      style={{ width: 1, height: 1, opacity: 0, position: "absolute" }}
      onLoadEnd={() => {
        finish();
        setFinish(null);
      }}
    />
  );
}
