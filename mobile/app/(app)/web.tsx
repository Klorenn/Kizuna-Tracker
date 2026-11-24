import { useLocalSearchParams } from "expo-router";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { WebScreen } from "../../src/web/WebScreen";

/** web?path=/retos/123: any web screen the app has no native version of, inside the app. */
export default function Web() {
  const { path } = useLocalSearchParams<{ path?: string }>();
  return <WebScreen path={safeInternalPath(path) ?? "/"} />;
}
