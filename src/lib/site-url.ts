import { parse } from "@/lib/site-metadata-url";

/** Public origin for share links: NEXT_PUBLIC_SITE_URL, else derived from request headers. */
export function siteOrigin(h: Headers): string {
  const configured = parse(process.env.NEXT_PUBLIC_SITE_URL)?.origin;
  if (configured) return configured;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
