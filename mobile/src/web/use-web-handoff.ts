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
export function useWebHandoff(
  path: string,
  deps: {
    request(path: string): Promise<HandoffResult>;
    /** a url to load as is when the WebView already holds a web session (no new handoff session) */
    direct?: () => string | null;
    onLinked?: () => void;
    /** the direct load landed on /login: the web cookies are gone */
    onStale?: () => void;
  },
) {
  const [state, setState] = useState<HandoffState>({ kind: "loading" });
  const links = useRef(0);
  const alive = useRef(true);
  const direct = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const fetchLink = useCallback(async () => {
    links.current += 1;
    setState({ kind: "loading" });
    const r = await depsRef.current.request(path);
    if (!alive.current) return;
    if (r.ok) {
      depsRef.current.onLinked?.();
      setState({ kind: "ready", url: r.url });
    }
    else setState({ kind: r.reason === "unauthorized" ? "unauthenticated" : r.reason === "offline" ? "offline" : "failed" });
  }, [path]);

  useEffect(() => {
    alive.current = true;
    links.current = 0;
    const url = depsRef.current.direct?.() ?? null;
    direct.current = url !== null;
    if (url) setState({ kind: "ready", url });
    else void fetchLink();
    return () => {
      alive.current = false;
    };
  }, [fetchLink]);

  const staleDirect = () => {
    direct.current = false;
    depsRef.current.onStale?.();
    links.current = 0;
    void fetchLink();
  };

  return {
    state,
    /** a real page rendered: from here a /bienvenida landing is the user's own web sign-out */
    onPage: () => {
      direct.current = false;
    },
    /** true when the /bienvenida landing was stale cookies on a direct load (handled with one fresh handoff, no logout) */
    onWebSignedOut: () => {
      if (!direct.current) return false;
      staleDirect();
      return true;
    },
    onLoginLanding: () => {
      if (direct.current) staleDirect();
      else if (links.current < MAX_LINKS) void fetchLink();
      else setState({ kind: "expired" });
    },
    retry: () => {
      links.current = 0;
      void fetchLink();
    },
  };
}
