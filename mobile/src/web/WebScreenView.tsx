import { useMemo, useRef, useState, type ComponentType, type Ref, type RefObject } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { AndroidWebViewProps } from "react-native-webview/lib/WebViewTypes";
import { useTheme } from "../theme/ThemeProvider";
import type { HandoffState } from "./use-web-handoff";
import { decideNavigation, isExpiredLanding, isWebSignedOut, parseBackReply } from "./policy";

// The package types intersect the iOS, Android and Windows props, which makes literal props (false, "never") unassignable;
// the app is Android only, so the component is typed by its Android props.
const AppWebView = WebView as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebView> }>;

type Props = {
  state: HandoffState;
  origin: string;
  userAgentName: string;
  webRef?: RefObject<WebView | null>;
  onRetry: () => void;
  onExternal: (url: string) => void;
  onPair: (url: string) => void;
  onNative: (href: string) => void;
  onLoginLanding: () => void;
  onSignedOut: () => void;
  /** every same-origin navigation (the registration screen watches for the end of the flow) */
  onNavigate?: (url: string) => void;
  /** Android back: lets the container call goBack */
  onCanGoBack?: (can: boolean) => void;
  /** the page's answer to the back button (validated: exact shape, our origin). Without it the WebView has no message channel at all. */
  onBackReply?: (reply: { id: number; handled: boolean }) => void;
};

const MESSAGE: Partial<Record<HandoffState["kind"], { title: string; body?: string }>> = {
  expired: { title: "Sesión web expirada", body: "Vuelve a intentarlo para abrir esta pantalla." },
  offline: { title: "Sin conexión", body: "Conéctate a internet para abrir Kizuna." },
  failed: { title: "No pudimos abrir esta pantalla. Inténtalo de nuevo." },
};

function Message({ copy, onRetry }: { copy: { title: string; body?: string }; onRetry: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <>
      <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
      {copy.body ? <Text style={{ color: colors.muted, textAlign: "center" }}>{copy.body}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.button, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Reintentar</Text>
      </Pressable>
    </>
  );
}

/**
 * One web screen of the app. It is only ever given the handoff URL of our own origin and refuses every other navigation.
 * The only bridge is the back reply (`onBackReply`: one validated message shape from our origin; the app injects only the back call
 * when the button is pressed). No file access, no mixed content, no extra windows.
 */
export function WebScreenView({ state, origin, userAgentName, webRef, onRetry, onExternal, onPair, onNative, onLoginLanding, onSignedOut, onNavigate, onCanGoBack, onBackReply }: Props) {
  const { colors } = useTheme();
  // the page failed to load (no network): the WebView stays mounted underneath, so its history survives the retry
  const [loadFailed, setLoadFailed] = useState(false);
  // no page has loaded yet: a reload() would drop the handoff's X-Kizuna-Native header (the server answers 403), so retry asks the parent
  const loaded = useRef(false);
  const httpFailed = useRef(false);
  // the page the user is on, and a key that remounts the WebView when its renderer died (a dead one never recovers by itself)
  const lastUrl = useRef<string | null>(null);
  const [instance, setInstance] = useState(0);
  const handoffUrl = state.kind === "ready" ? state.url : null;
  const source = useMemo(() => (handoffUrl ? { uri: lastUrl.current ?? handoffUrl, headers: { "X-Kizuna-Native": "1" } } : undefined), [handoffUrl, instance]);
  const onRendererGone = () => {
    // before any page loaded the link is spent (one-time): ask the parent for a fresh one; later the session cookies carry the page
    if (!loaded.current || !lastUrl.current) onRetry();
    else setInstance((n) => n + 1);
  };

  if (state.kind === "ready") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppWebView
        key={instance}
        ref={webRef}
        source={source!}
        androidLayerType="hardware"
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        overScrollMode="never"
        nestedScrollEnabled
        textZoom={100}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        onRenderProcessGone={onRendererGone}
        // "*" on purpose: with a narrower list the library opens non-matching urls with Linking itself, skipping the policy below
        originWhitelist={["*"]}
        applicationNameForUserAgent={userAgentName}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={(req) => {
          const d = decideNavigation(req.url, origin);
          if (d.action === "allow") return true;
          if (d.action === "external") onExternal(d.url);
          else if (d.action === "pair") onPair(d.url);
          else if (d.action === "native") onNative(d.href);
          return false;
        }}
        onMessage={
          onBackReply
            ? (e) => {
                const r = parseBackReply(e.nativeEvent.data, e.nativeEvent.url, origin);
                if (r) onBackReply(r);
              }
            : undefined
        }
        onNavigationStateChange={(nav) => {
          if (decideNavigation(nav.url, origin).action === "allow" && !isExpiredLanding(nav.url, origin) && !isWebSignedOut(nav.url, origin)) lastUrl.current = nav.url;
          if (isExpiredLanding(nav.url, origin)) onLoginLanding();
          else if (isWebSignedOut(nav.url, origin)) onSignedOut();
          else onNavigate?.(nav.url);
          onCanGoBack?.(Boolean((nav as { canGoBack?: boolean }).canGoBack));
        }}
        onLoadStart={() => {
          httpFailed.current = false;
        }}
        onError={() => setLoadFailed(true)}
        onHttpError={(e) => {
          const { statusCode, url } = e.nativeEvent;
          // only the first (handoff / direct) page: a 4xx/5xx of a sub-resource or later in the session is the web's own
          if (!loaded.current && statusCode >= 400 && url === state.url) {
            httpFailed.current = true;
            setLoadFailed(true);
          }
        }}
        onLoad={() => {
          if (httpFailed.current) return;
          loaded.current = true;
          setLoadFailed(false);
        }}
        style={{ flex: 1, backgroundColor: colors.bg }}
      />
      {loadFailed ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg }]}>
          <Message copy={MESSAGE.offline!} onRetry={() => {
              setLoadFailed(false);
              if (loaded.current) webRef?.current?.reload();
              else onRetry();
            }} />
        </View>
      ) : null}
      </View>
    );
  }
  if (state.kind === "loading" || state.kind === "unauthenticated") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <View style={[styles.center, { backgroundColor: colors.bg }]}>
      <Message copy={MESSAGE[state.kind]!} onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  button: { paddingHorizontal: 18, paddingVertical: 12, marginTop: 4 },
});
