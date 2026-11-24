export type LogoutDeps = {
  /** DELETE /api/m/push-token: needs the session, so it goes first */
  unregisterPush(): Promise<void>;
  /** Pomodoro notifications scheduled on this device */
  cancelScheduled(): Promise<void>;
  /** local scope: this device only, never the account's other sessions */
  signOut(): Promise<void>;
  clearQueries(): void;
  clearPersisted(): void;
  clearAuthStore(): Promise<void>;
  /** the WebView's cookies: no web page stays reachable authenticated */
  wipeWebSession(): Promise<void>;
  goToLogin(): void;
};

/**
 * The one logout sequence. Every step is best effort: whatever fails, the next ones still run and the user always
 * lands on the login screen. Calling it twice at once runs it once.
 */
export function createLogout(d: LogoutDeps): () => Promise<void> {
  let running: Promise<void> | null = null;
  const attempt = async (step: () => unknown) => {
    try {
      await step();
    } catch {
      // best effort
    }
  };
  return () =>
    (running ??= (async () => {
      await attempt(d.unregisterPush);
      await attempt(d.cancelScheduled);
      await attempt(d.signOut);
      await attempt(d.clearQueries);
      await attempt(d.clearPersisted);
      await attempt(d.clearAuthStore);
      await attempt(d.wipeWebSession);
      d.goToLogin();
      running = null;
    })());
}
