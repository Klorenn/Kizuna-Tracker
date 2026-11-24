import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { PermissionState } from "./registrar";

export type PushPermissionView = PermissionState | "unknown";
type Registrar = { permission(): Promise<PermissionState>; enable(): Promise<PermissionState> };

/** The notification permission for the Hoy banner. Refreshes when the app returns from the system settings. */
export function usePushPermission(registrar: Registrar, system: { openSettings: () => void }) {
  const [state, setState] = useState<PushPermissionView>("unknown");

  const refresh = useCallback(() => {
    registrar.permission().then(setState, () => undefined);
  }, [registrar]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  const enable = useCallback(async () => {
    setState(await registrar.enable());
  }, [registrar]);

  return { state, enable, openSettings: system.openSettings };
}
