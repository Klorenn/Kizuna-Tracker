/**
 * Android back with a web sheet open: ask the page to close its top sheet first. The page answers with the
 * back message (policy.ts `parseBackReply`); not handled, or no answer in `timeoutMs` (a web without the bridge, a hung page),
 * the app goes back / leaves as before. One request at a time; a late or foreign answer is ignored.
 */
export const BACK_TIMEOUT_MS = 150;

/** The only script the app ever injects: call the page's bridge, or answer "not handled" itself when it has none. */
export function backScript(id: number): string {
  const none = JSON.stringify(JSON.stringify({ t: "kizuna.back", id, handled: false }));
  return `(function(){try{var f=window.__kizunaBack;if(typeof f==="function"){f(${id});}else if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(${none});}}catch(e){}})();\ntrue;`;
}

export function createBackCoordinator(opts: {
  /** Injects the call into the WebView; false when there is no WebView to ask. */
  ask: (id: number) => boolean;
  /** What back did before: go back in the web, or leave the screen. */
  fallback: () => void;
  timeoutMs?: number;
}) {
  let seq = 0;
  let pending: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;

  const settle = (handled: boolean) => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
    if (!handled) opts.fallback();
  };

  return {
    /** The hardware back press: true when handled (the answer comes later), false to let the system act. */
    press(): boolean {
      if (pending) return true;
      const id = ++seq;
      if (!opts.ask(id)) return false;
      pending = { id, timer: setTimeout(() => settle(false), opts.timeoutMs ?? BACK_TIMEOUT_MS) };
      return true;
    },
    reply(r: { id: number; handled: boolean }) {
      if (pending && pending.id === r.id) settle(r.handled);
    },
    dispose() {
      if (pending) clearTimeout(pending.timer);
      pending = null;
    },
  };
}
