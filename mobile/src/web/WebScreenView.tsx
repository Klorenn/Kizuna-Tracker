import type { ComponentType, Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { AndroidWebViewProps } from "react-native-webview/lib/WebViewTypes";
import { useTheme } from "../theme/ThemeProvider";
import type { HandoffState } from "./use-web-handoff";
import { decideNavigation, isExpiredLanding, isWebSignedOut } from "./policy";

// The package types intersect the iOS, Android and Windows props, which makes literal props (false, "never") unassignable;
// the app is Android only, so the component is typed by its Android props.
const AppWebView = WebView as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebView> }>;

type Props = {
  state: HandoffState;
  origin: string;
  userAgentName: string;
  webRef?: Ref<WebView>;
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
};

const MESSAGE: Partial<Record<HandoffState["kind"], { title: string; body?: string }>> = {
  expired: { title: "Sesión web expirada", body: "Vuelve a intentarlo para abrir esta pantalla." },
  offline: { title: "Sin conexión", body: "Conéctate a internet para abrir esta pantalla." },
  failed: { title: "No pudimos abrir esta pantalla. Inténtalo de nuevo." },
};

/**
 * One web screen of the app. It is only ever given the handoff URL of our own origin and refuses every other navigation.
 * No JS bridge (no onMessage, nothing injected), no file access, no mixed content, no extra windows.
 */
export function WebScreenView({ state, origin, userAgentName, webRef, onRetry, onExternal, onPair, onNative, onLoginLanding, onSignedOut, onNavigate, onCanGoBack }: Props) {
  const { colors, radius } = useTheme();

  if (state.kind === "ready") {
    return (
      <AppWebView
        ref={webRef}
        source={{ uri: state.url, headers: { "X-Kizuna-Native": "1" } }}
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
        onNavigationStateChange={(nav) => {
          if (isExpiredLanding(nav.url, origin)) onLoginLanding();
          else if (isWebSignedOut(nav.url, origin)) onSignedOut();
          else onNavigate?.(nav.url);
          onCanGoBack?.(Boolean((nav as { canGoBack?: boolean }).canGoBack));
        }}
        style={{ flex: 1, backgroundColor: colors.bg }}
      />
    );
  }
  if (state.kind === "loading" || state.kind === "unauthenticated") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const copy = MESSAGE[state.kind]!;
  return (
    <View style={[styles.center, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
      {copy.body ? <Text style={{ color: colors.muted, textAlign: "center" }}>{copy.body}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.button, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  button: { paddingHorizontal: 18, paddingVertical: 12, marginTop: 4 },
});
