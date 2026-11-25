import { useState } from "react";
import { Linking } from "react-native";
import { PushBanner } from "./PushBanner";
import { usePushPermission } from "./use-push-permission";
import { pushRegistrar } from "./wiring";

/**
 * The permission prompt over the WebView: asked on a tap, dismissible for the session, and silent after a denial (native
 * push is the only push in the app; the system settings are the way back, not a banner over the web).
 */
export function PushPrompt() {
  const { state, enable, openSettings } = usePushPermission(pushRegistrar, { openSettings: () => void Linking.openSettings() });
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || state !== "ask") return null;
  return <PushBanner state={state} onEnable={() => void enable()} onOpenSettings={openSettings} onDismiss={() => setDismissed(true)} />;
}
