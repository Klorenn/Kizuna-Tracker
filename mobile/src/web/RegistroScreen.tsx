import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { env } from "../lib/env";
import { nativeUserAgentName, registroOutcome } from "./policy";
import { wipeWebSession } from "./cookie-wiper";
import { WebScreenView } from "./WebScreenView";

/**
 * Sign-up lives on the web (/registro), with no session to hand over. When the WebView leaves the registration flow the
 * account exists: the web cookies are wiped and the user comes back to the native login to sign in.
 */
export function RegistroScreen() {
  const router = useRouter();
  const origin = env().apiUrl;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    void wipeWebSession().then(() => router.replace("/login?creada=1"));
  };
  return (
    <WebScreenView
      state={{ kind: "ready", url: `${origin}/registro` }}
      origin={origin}
      userAgentName={nativeUserAgentName(Constants.expoConfig?.version)}
      onRetry={() => undefined}
      onExternal={(url) => void Linking.openURL(url).catch(() => undefined)}
      onPair={() => undefined}
      onNative={() => undefined}
      onLoginLanding={done}
      onSignedOut={done}
      onNavigate={(url) => registroOutcome(url, origin) === "done" && done()}
    />
  );
}
