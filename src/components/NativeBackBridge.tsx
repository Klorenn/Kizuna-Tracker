"use client";

import { useEffect } from "react";
import { installNativeBack } from "@/lib/native-back";
import { sheetStack } from "@/lib/sheet-stack";

/** Inside the native app only: lets Android back close the top sheet before leaving the page (see `installNativeBack`). */
export function NativeBackBridge() {
  useEffect(() => installNativeBack(window, navigator.userAgent, () => sheetStack.closeTop()), []);
  return null;
}
