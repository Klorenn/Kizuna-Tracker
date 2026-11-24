type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };
type Setter = (value: boolean) => void;

export type ConnectivityDeps = {
  netInfo: { addEventListener(listener: (state: NetState) => void): () => void };
  appState: { addEventListener(type: "change", listener: (state: string) => void): { remove(): void } };
  onlineManager: { setEventListener(setup: (set: Setter) => () => void): void };
  focusManager: { setEventListener(setup: (set: Setter) => () => void): void };
};

/**
 * TanStack Query must know when the device is online and when the app is in the foreground: paused taps resume on
 * reconnect, and a refetch happens on focus. An unknown network state counts as online (the request decides).
 */
export function wireConnectivity({ netInfo, appState, onlineManager, focusManager }: ConnectivityDeps) {
  onlineManager.setEventListener((setOnline) =>
    netInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
  );
  focusManager.setEventListener((setFocused) => {
    const sub = appState.addEventListener("change", (state) => setFocused(state === "active"));
    return () => sub.remove();
  });
}
