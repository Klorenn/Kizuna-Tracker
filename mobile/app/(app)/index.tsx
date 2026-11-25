import { useLocalSearchParams } from "expo-router";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { WebScreen } from "../../src/web/WebScreen";

/**
 * The whole app: the web, in one full-screen WebView. `path` (+ a nonce `n`) is how a push tap or a kizuna://app link asks
 * for another page; a new request remounts the screen on that path. Anything unsafe opens the web home.
 */
export default function Home() {
  const { path, n } = useLocalSearchParams<{ path?: string; n?: string }>();
  const safe = safeInternalPath(path) ?? "/";
  return <WebScreen key={`${safe}|${n ?? ""}`} path={safe} />;
}
