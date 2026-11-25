export type LogoutDeps = {
  /** DELETE /api/m/push-token: needs the session, so it goes first */
  unregisterPush(): Promise<void>;
  /** Notifications scheduled on this device */
  cancelScheduled(): Promise<void>;
  /** revokes the web sessions the handoffs created (global), then this device (local) */
  signOut(): Promise<void>;
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
      await attempt(d.clearPersisted);
      await attempt(d.clearAuthStore);
      await attempt(d.wipeWebSession);
      d.goToLogin();
      running = null;
    })());
}

type AuthLike = { signOut(opts: { scope: "global" | "local" }): Promise<{ error: unknown }> };

/**
 * Every handoff mints a web session, so a local sign-out would leave them alive server side. Global revokes them all (and the
 * account's other devices, which is the price of a robust logout); if that fails (offline) this device is still cleared locally.
 */
export async function signOutEverywhere(auth: AuthLike): Promise<void> {
  try {
    const { error } = await auth.signOut({ scope: "global" });
    if (!error) {
      await auth.signOut({ scope: "local" });
      return;
    }
  } catch {
    // fall through to the local sign-out
  }
  await auth.signOut({ scope: "local" });
}
