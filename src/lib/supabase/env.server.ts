import "server-only";
import { supabasePublicKey, supabaseUrl } from "./env";

function clean(v: string | undefined): string | null {
  return v && v.trim() !== "" ? v.trim() : null;
}

/** Service-role key. Server only: never import this from client code. */
export function supabaseServiceKey(): string | null {
  return (
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    clean(process.env.SUPABASE_SECRET_KEY)
  );
}

/** Booleans only: safe to log or return from a public endpoint. */
export function configPresence(): {
  url: boolean;
  publicKey: boolean;
  serviceKey: boolean;
} {
  return {
    url: supabaseUrl() !== null,
    publicKey: supabasePublicKey() !== null,
    serviceKey: supabaseServiceKey() !== null,
  };
}
