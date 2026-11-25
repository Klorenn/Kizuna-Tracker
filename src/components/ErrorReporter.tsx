"use client";

import { useEffect } from "react";
import { reportClientError, setNavigating } from "@/lib/client-errors/report";

/** Mounted once in the root layout: window errors and unhandled rejections go to /api/client-errors. Renders nothing. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error instanceof Error ? e.error : null;
      reportClientError({ kind: "error", message: err?.message ?? e.message, stack: err?.stack });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportClientError({
        kind: "unhandledrejection",
        message: r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : "Non-Error rejection",
        stack: r instanceof Error ? r.stack : null,
      });
    };
    const onLeave = () => setNavigating(true);
    const onShow = () => setNavigating(false);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  return null;
}
