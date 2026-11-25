import { safeInternalPath } from "@/lib/safe-internal-path";
import { mapWebPath } from "../push/map-web-path";

export type NavDecision =
  | { action: "allow" }
  | { action: "block" }
  | { action: "external"; url: string }
  | { action: "pair"; url: string }
  | { action: "native"; href: string };

type Parts = { scheme: string; userinfo: string; host: string; path: string; query: string };

// A small hand parser: React Native's URL does not implement every getter, and a policy must not depend on that.
const URL_RE = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

function parse(url: string): Parts | null {
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  const authority = m[2] ?? "";
  const at = authority.lastIndexOf("@");
  return { scheme: m[1].toLowerCase(), userinfo: at === -1 ? "" : authority.slice(0, at), host: (at === -1 ? authority : authority.slice(at + 1)).toLowerCase(), path: m[3] ?? "", query: m[4] ?? "" };
}

const CODE = /^[A-Za-z0-9-]{4,16}$/;

function pairingLink(p: Parts): NavDecision {
  const raw = /(?:^|&)code=([^&]*)/.exec(p.query)?.[1];
  let code: string | null = null;
  try {
    code = raw ? decodeURIComponent(raw) : null;
  } catch {
    code = null;
  }
  return p.host === "widget" && p.path === "/pair" && code !== null && CODE.test(code)
    ? { action: "pair", url: `kizuna://widget/pair?code=${code}` }
    : { action: "block" };
}

const hostOf = (origin: string) => parse(origin)?.host ?? "";
const sameOrigin = (p: Parts, origin: string) => p.scheme === "https" && p.userinfo === "" && p.host === hostOf(origin);

/**
 * What the WebView may do with a navigation. Only the web origin (https, no credentials) loads inside it. Other websites,
 * mail and phone links go to the system; the web's widget-pairing intent becomes the kizuna://widget/pair link; a
 * kizuna://app link is routed natively. Everything else (javascript:, file:, data:, content:, other intents) is refused.
 */
export function decideNavigation(url: string, origin: string): NavDecision {
  if (url === "about:blank") return { action: "allow" };
  const p = parse(url);
  if (!p) return { action: "block" };
  switch (p.scheme) {
    case "https":
      if (p.userinfo !== "") return { action: "block" };
      return sameOrigin(p, origin) ? { action: "allow" } : { action: "external", url };
    case "http":
      return p.host === hostOf(origin) || p.userinfo !== "" ? { action: "block" } : { action: "external", url };
    case "mailto":
    case "tel":
      return { action: "external", url };
    case "intent":
    case "kizuna": {
      if (p.host === "widget") return pairingLink(p);
      if (p.scheme === "kizuna" && p.host === "app") {
        const href = mapWebPath(safeInternalPath(`${p.path || "/"}${p.query ? `?${p.query}` : ""}`));
        return href ? { action: "native", href } : { action: "block" };
      }
      return { action: "block" };
    }
    default:
      return { action: "block" };
  }
}

const pathOn = (url: string, origin: string): string | null => {
  const p = parse(url);
  return p && sameOrigin(p, origin) ? p.path : null;
};

/** The one-time link was not accepted (expired or already used): the web answered with its login page. */
export function isExpiredLanding(url: string, origin: string): boolean {
  const path = pathOn(url, origin);
  return path === "/login" || (path?.startsWith("/login/") ?? false);
}

/** The web signed the user out (its sign-out lands here, and so does deleting the account). */
export function isWebSignedOut(url: string, origin: string): boolean {
  return pathOn(url, origin) === "/bienvenida";
}

/** Registration lives on /registro (and the legal pages it links). Anywhere else on the web means it is over. */
export function registroOutcome(url: string, origin: string): "stay" | "done" {
  const path = pathOn(url, origin);
  if (path === null) return "stay";
  return path.startsWith("/registro") || path.startsWith("/legal") ? "stay" : "done";
}

/** `applicationNameForUserAgent`: the web hides what the app already provides when it sees this marker. */
export function nativeUserAgentName(version: string | undefined): string {
  const major = Number.parseInt(version ?? "", 10);
  return `KizunaNative/${Number.isFinite(major) && major > 0 ? major : 1}`;
}

/** The one message type the page may post (web: src/lib/native-back.ts). */
const BACK_TYPE = "kizuna.back";

/**
 * The page's answer to the back button: exactly `{ t: "kizuna.back", id, handled }`, sent from a page of our own origin (https, no
 * credentials). Anything else (another origin, another shape, extra keys, an oversized payload) is dropped: the WebView has no other bridge.
 */
export function parseBackReply(data: unknown, url: unknown, origin: string): { id: number; handled: boolean } | null {
  if (typeof data !== "string" || data.length > 200 || typeof url !== "string") return null;
  const p = parse(url);
  if (!p || !sameOrigin(p, origin)) return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 3 || !keys.every((k) => k === "t" || k === "id" || k === "handled")) return null;
  if (o.t !== BACK_TYPE || typeof o.id !== "number" || !Number.isSafeInteger(o.id) || o.id < 0 || typeof o.handled !== "boolean") return null;
  return { id: o.id, handled: o.handled };
}
