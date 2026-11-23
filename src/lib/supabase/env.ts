// Next.js inlines NEXT_PUBLIC_* only for literal `process.env.NEXT_PUBLIC_X`
// expressions, so every name below is referenced literally. The non-public names
// only exist on the server (undefined in the browser bundle).

function clean(v: string | undefined): string | null {
  return v && v.trim() !== "" ? v.trim() : null;
}

/** Project URL: NEXT_PUBLIC_SUPABASE_URL, else SUPABASE_URL. */
export function supabaseUrl(): string | null {
  return (
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? clean(process.env.SUPABASE_URL)
  );
}

/**
 * URL for rendering that must match between server HTML and the browser bundle:
 * only the NEXT_PUBLIC_ name is inlined into the client, so never fall back to a
 * server-only name here (it would cause a hydration mismatch).
 */
export function supabaseRenderUrl(): string | null {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Public (anon / publishable) key, first one set wins. */
export function supabasePublicKey(): string | null {
  return (
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.SUPABASE_ANON_KEY) ??
    clean(process.env.SUPABASE_PUBLISHABLE_KEY)
  );
}

export function supabasePublicConfig(): { url: string; key: string } | null {
  const url = supabaseUrl();
  const key = supabasePublicKey();
  return url && key ? { url, key } : null;
}
