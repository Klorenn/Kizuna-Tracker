import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Linking } from "react-native";
import type { WebView } from "react-native-webview";
import { useLogout } from "../auth/use-logout";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import { backScript, createBackCoordinator } from "./back-coordinator";
import { requestWebSession } from "./handoff";
import { nativeUserAgentName } from "./policy";
import { useWebHandoff } from "./use-web-handoff";
import { clearWebLinked, isWebLinked, markWebLinked } from "./web-session-state";
import { useSession } from "../auth/session";
import { WebScreenView } from "./WebScreenView";

/** The whole web app in one full-screen WebView, signed in through the one-time handoff link (or the live web session). */
export function WebScreen({ path }: { path: string }) {
  const router = useRouter();
  const logout = useLogout();
  const webRef = useRef<WebView | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  const request = useCallback(async (p: string) => {
    const { data } = await supabase().auth.getSession();
    const jwt = data.session?.access_token;
    return jwt ? requestWebSession(env().apiUrl, jwt, p) : ({ ok: false, reason: "unauthorized" } as const);
  }, []);
  const userId = useSession().session?.user.id ?? "";
  const { state, onLoginLanding, onWebSignedOut, onPage, retry } = useWebHandoff(path, {
    request,
    // the WebView already holds this user's web session: no new handoff (each one mints a session on the server)
    direct: () => (isWebLinked(userId) ? `${env().apiUrl}${path}` : null),
    onLinked: () => markWebLinked(userId),
    onStale: clearWebLinked,
  });

  // the native session is not valid (refresh failed): the native login, never a web login
  useEffect(() => {
    if (state.kind === "unauthenticated") router.replace("/login");
  }, [state.kind, router]);

  // Android back: the page closes its top sheet first; only when it did not (or did not answer) does back go back in the web, then leave
  const canGoBackRef = useRef(false);
  canGoBackRef.current = canGoBack;
  const leave = useRef(() => {});
  leave.current = () => (router.canGoBack() ? router.back() : BackHandler.exitApp());
  const [backBridge] = useState(() =>
    createBackCoordinator({
      ask: (id) => {
        const web = webRef.current;
        if (!web) return false;
        web.injectJavaScript(backScript(id));
        return true;
      },
      fallback: () => (canGoBackRef.current ? webRef.current?.goBack() : leave.current()),
    }),
  );
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => backBridge.press());
    return () => {
      sub.remove();
      backBridge.dispose();
    };
  }, [backBridge]);

  return (
    <WebScreenView
      state={state}
      origin={env().apiUrl}
      userAgentName={nativeUserAgentName(Constants.expoConfig?.version)}
      webRef={webRef}
      onRetry={retry}
      onExternal={(url) => void Linking.openURL(url).catch(() => undefined)}
      onPair={(url) => void Linking.openURL(url).catch(() => undefined)}
      onNative={(href) => router.replace(href as never)}
      onLoginLanding={onLoginLanding}
      onSignedOut={() => onWebSignedOut() || void logout()}
      onNavigate={onPage}
      onCanGoBack={setCanGoBack}
      onBackReply={backBridge.reply}
    />
  );
}
