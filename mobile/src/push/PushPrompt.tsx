import { Linking } from "react-native";
import { PushBanner } from "./PushBanner";
import { usePushPermission } from "./use-push-permission";
import { pushRegistrar } from "./wiring";

/** The Hoy banner: the in-context permission prompt, and the Settings link after a denial. */
export function PushPrompt() {
  const { state, enable, openSettings } = usePushPermission(pushRegistrar, { openSettings: () => void Linking.openSettings() });
  return <PushBanner state={state} onEnable={() => void enable()} onOpenSettings={openSettings} />;
}
