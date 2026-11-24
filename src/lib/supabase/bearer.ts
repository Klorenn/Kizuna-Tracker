import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { VerifiedClaims } from "@/lib/mobile-auth";
import type { Database } from "./database.types";
import { supabasePublicConfig } from "./env";

/** Anon-key client that acts as the caller: RLS sees the bearer JWT. No session is stored or refreshed. */
export function createBearerClient(jwt: string) {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  return createClient<Database>(config.url, config.key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The verified identity of a claims object: an `authenticated` role and a non-empty string sub. Else null. */
export function claimsToVerified(claims: Record<string, unknown>): VerifiedClaims | null {
  const { sub, role } = claims;
  return role === "authenticated" && typeof sub === "string" && sub !== "" ? { sub } : null;
}

type ClaimsClient = {
  auth: { getClaims(jwt: string): Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }> };
};

export async function verifyJwtWith(client: ClaimsClient, jwt: string): Promise<VerifiedClaims | null> {
  try {
    const { data, error } = await client.auth.getClaims(jwt);
    return error || !data ? null : claimsToVerified(data.claims);
  } catch {
    return null;
  }
}

/** getClaims verifies locally against the project's JWKS when keys are asymmetric (no Auth round trip). */
export async function verifyJwt(jwt: string): Promise<VerifiedClaims | null> {
  return verifyJwtWith(createBearerClient(jwt), jwt);
}

type UserClient = { auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> } };

/**
 * For routes that mint something from a session (the web handoff): the JWT must carry a `session_id` and that session must
 * still exist server side (getUser asks Auth), so a token from a signed-out session is refused even before it expires.
 */
export async function verifyLiveSessionWith(claimsClient: ClaimsClient, admin: UserClient, jwt: string): Promise<VerifiedClaims | null> {
  try {
    const { data, error } = await claimsClient.auth.getClaims(jwt);
    if (error || !data) return null;
    const verified = claimsToVerified(data.claims);
    if (!verified || typeof data.claims.session_id !== "string" || data.claims.session_id === "") return null;
    const { data: user, error: userError } = await admin.auth.getUser(jwt);
    return userError || user.user?.id !== verified.sub ? null : verified;
  } catch {
    return null;
  }
}

export async function verifyLiveSession(jwt: string): Promise<VerifiedClaims | null> {
  const { createAdminClient } = await import("./admin");
  return verifyLiveSessionWith(createBearerClient(jwt), { auth: createAdminClient().auth }, jwt);
}
