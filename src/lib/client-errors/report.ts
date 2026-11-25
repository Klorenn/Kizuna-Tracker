import { isNoise } from "./noise";
import { createGate } from "./gate";
import type { ErrorKind } from "./payload";

const ENDPOINT = "/api/client-errors";
const MAX_PER_PAGE_LOAD = 10;

const gate = createGate(MAX_PER_PAGE_LOAD);
let navigating = false;

/** Called by the reporter component on pagehide/beforeunload: network errors of a navigation are noise. */
export function setNavigating(value: boolean) {
  navigating = value;
}

type Report = { kind: ErrorKind; message: string; stack?: string | null; digest?: string | null };

/**
 * Fire-and-forget report: client-side noise filter, dedup and a cap of 10 per page load, then sendBeacon with a keepalive
 * fetch as fallback. Never throws. The server sanitizes everything again; this only keeps the body small and the noise out.
 */
export function reportClientError(r: Report): void {
  try {
    if (typeof window === "undefined") return;
    const message = (r.digest ? `${r.message} [digest:${r.digest}]` : r.message || "unknown error").slice(0, 2000);
    const stack = typeof r.stack === "string" ? r.stack.slice(0, 5000) : undefined;
    if (isNoise({ message, stack, navigating })) return;
    const firstLine = (stack ?? "").split("\n").find((l) => /^\s*at\s|@/.test(l)) ?? "";
    if (!gate(`${r.kind}|${message}|${firstLine}`)) return;
    const body = JSON.stringify({ kind: r.kind, message, ...(stack ? { stack } : {}), path: window.location.pathname });
    if (body.length > 8000) return;
    const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (!sent) void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // reporting must never break the page
  }
}
