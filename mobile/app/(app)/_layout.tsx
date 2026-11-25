import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { gateTarget } from "../../src/auth/gate";
import { useSession } from "../../src/auth/session";
import { PushBridge } from "../../src/push/PushBridge";
import { PushPrompt } from "../../src/push/PushPrompt";

/** The auth gate: nothing under (app) renders without a session. */
export default function AppLayout() {
  const { state } = useSession();
  const target = gateTarget(state, "app");
  if (target === "wait") return null;
  if (target === "/login") return <Redirect href="/login" />;
  return (
    // flex: 1 down the whole chain so the WebView gets the screen; the banner is in-flow above it, never an overlay
    <View testID="app-frame" style={{ flex: 1 }}>
      <PushBridge />
      <PushPrompt />
      <Slot />
    </View>
  );
}
