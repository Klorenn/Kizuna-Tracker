import { Redirect, usePathname } from "expo-router";
import { mapWebPath } from "../src/push/map-web-path";

/** A web path the app has no screen for opens in the WebView; anything that is not a safe internal path goes home. */
export default function NotFound() {
  const pathname = usePathname();
  return <Redirect href={(mapWebPath(pathname) ?? "/") as never} />;
}
