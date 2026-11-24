import { useCallback, useEffect, useRef, useState } from "react";
import type { HandoffResult } from "./handoff";

export type HandoffState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "unauthenticated" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "expired" };

const MAX_LINKS = 2; // the first link and ONE fresh retry: never a loop

/**
 * The handoff of one WebView screen: asks for a one-time link, and when the web answers with its login (a link that was
 * expired or already used) asks for ONE fresh link; after that the user sees "Sesión web expirada" with a retry.
 */
export function useWebHandoff(path: string, deps: { request(path: string): Promise<HandoffResult> }) {
  const [state, setState] = useState<HandoffState>({ kind: "loading" });
  const links = useRef(0);
  const alive = useRef(true);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const fetchLink = useCallback(async () => {
    links.current += 1;
    setState({ kind: "loading" });
    const r = await depsRef.current.request(path);
    if (!alive.current) return;
    if (r.ok) setState({ kind: "ready", url: r.url });
    else setState({ kind: r.reason === "unauthorized" ? "unauthenticated" : r.reason === "offline" ? "offline" : "failed" });
  }, [path]);

  useEffect(() => {
    alive.current = true;
    links.current = 0;
    void fetchLink();
    return () => {
      alive.current = false;
    };
  }, [fetchLink]);

  return {
    state,
    onLoginLanding: () => (links.current < MAX_LINKS ? void fetchLink() : setState({ kind: "expired" })),
    retry: () => {
      links.current = 0;
      void fetchLink();
    },
  };
}
