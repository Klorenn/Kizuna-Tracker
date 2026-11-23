export const FALLBACK_SITE_URL = "https://kizuna-tracker.vercel.app";

type SiteEnv = Partial<Record<string, string | undefined>> & {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

function parse(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url;
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
