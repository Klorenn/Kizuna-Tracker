"use client";

import { createContext, useContext, type ReactNode } from "react";

const NativeShellContext = createContext(false);

/** `native` is decided on the server from the user agent (see `isNativeUA`). */
export function NativeShellProvider({ native, children }: { native: boolean; children: ReactNode }) {
  return <NativeShellContext.Provider value={native}>{children}</NativeShellContext.Provider>;
}

export const useNativeShell = () => useContext(NativeShellContext);

/** Renders nothing inside the native app's WebView: for UI the app already provides natively. */
export function HideInNative({ children }: { children: ReactNode }) {
  return useNativeShell() ? null : <>{children}</>;
}
