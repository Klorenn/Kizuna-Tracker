import { createServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createServerClient>>;

export const SIGN_IN_COPY = "Inicia sesión para continuar.";
export const CONNECTION_COPY = "No pudimos conectar. Inténtalo de nuevo en unos minutos.";

export type Authed =
  | { ok: true; supabase: Client; userId: string }
  /** `unavailable`: the session could not be checked (network, server trouble), which is not a lost session. */
  | { ok: false; error: string; unavailable: boolean };

/** An Auth answer that means "there is no valid session", as opposed to "could not ask". */
function isSignedOutError(e: { name?: string; status?: number }): boolean {
  if (e.name === "AuthSessionMissingError") return true;
  return typeof e.status === "number" && e.status >= 400 && e.status < 500;
}

/**
 * The first line of every server action: the signed-in user and a client acting as them, or a ready
 * `{ ok: false, error }` the action returns as is. Actions that write only through RPCs still call
 * it, so a request without a session never reaches the database.
 */
export async function requireUser(): Promise<Authed> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.getUser();
    const id = data?.user?.id;
    if (id) return { ok: true, supabase, userId: id };
    if (error && !isSignedOutError(error)) return { ok: false, error: CONNECTION_COPY, unavailable: true };
    return { ok: false, error: SIGN_IN_COPY, unavailable: false };
  } catch {
    return { ok: false, error: CONNECTION_COPY, unavailable: true };
  }
}
