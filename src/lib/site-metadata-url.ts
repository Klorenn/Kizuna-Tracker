export const FALLBACK_SITE_URL = "https://kizuna-tracker.vercel.app";

type SiteEnv = Partial<Record<string, string | undefined>> & {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:|\/|$)/i;

/** Origin of a configured site URL; adds a protocol when missing (http for localhost). Null if unusable. */
export function parse(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value)
    ? value
    : `${LOCAL_HOST.test(value) ? "http" : "https"}://${value}`;
  try {
    return new URL(new URL(withProtocol).origin);
  } catch {
    return null;
  }
}

/** Absolute site origin used as `metadataBase`, so social cards get absolute URLs. */
export function resolveSiteUrl(env: SiteEnv = process.env): URL {
  return (
    parse(env.NEXT_PUBLIC_SITE_URL) ??
    parse(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    new URL(FALLBACK_SITE_URL)
  );
}
