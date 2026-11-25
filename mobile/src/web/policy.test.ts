import { decideNavigation, isExpiredLanding, isWebSignedOut, registroOutcome, nativeUserAgentName, parseBackReply } from "./policy";

const O = "https://kizuna.example";

describe("decideNavigation", () => {
  it("allows the web origin, handoff included", () => {
    expect(decideNavigation("https://kizuna.example/retos", O)).toEqual({ action: "allow" });
    expect(decideNavigation("https://kizuna.example/auth/native-handoff?token_hash=abc&next=%2F", O)).toEqual({ action: "allow" });
    expect(decideNavigation("about:blank", O)).toEqual({ action: "allow" });
  });
  it("opens other websites in the browser and keeps the WebView where it is", () => {
    expect(decideNavigation("https://evil.com/x", O)).toEqual({ action: "external", url: "https://evil.com/x" });
    expect(decideNavigation("https://kizuna.example.evil.com/", O)).toEqual({ action: "external", url: "https://kizuna.example.evil.com/" });
    expect(decideNavigation("mailto:hola@kizuna.example", O)).toEqual({ action: "external", url: "mailto:hola@kizuna.example" });
    expect(decideNavigation("https://site.kizuna.example.evil.com/", O).action).toBe("external");
    expect(decideNavigation("tel:+56911111111", O)).toEqual({ action: "external", url: "tel:+56911111111" });
  });
  it("blocks the origin over http, credentials in the url and every other scheme", () => {
    for (const bad of ["http://kizuna.example/retos", "https://user:pw@kizuna.example/", "javascript:alert(1)", "file:///etc/hosts", "data:text/html,hi", "content://x/y", "intent://evil#Intent;end", "ftp://kizuna.example/", "market://details?id=x", "sms:+56911111111", "https://kizuna.example@evil.com/", ""]) {
      expect(decideNavigation(bad, O)).toEqual({ action: "block" });
    }
  });
  it("turns the web's widget pairing intent into the kizuna://widget/pair link", () => {
    const intent = "intent://widget/pair?code=ABCD1234#Intent;scheme=kizuna;package=com.kizunatracker.app;S.browser_fallback_url=https%3A%2F%2Fx;end";
    expect(decideNavigation(intent, O)).toEqual({ action: "pair", url: "kizuna://widget/pair?code=ABCD1234" });
    expect(decideNavigation("kizuna://widget/pair?code=ABCD-EFGH", O)).toEqual({ action: "pair", url: "kizuna://widget/pair?code=ABCD-EFGH" });
  });
  it("refuses a pairing link with a bad code or another host", () => {
    expect(decideNavigation("kizuna://widget/pair?code=<script>", O)).toEqual({ action: "block" });
    expect(decideNavigation("kizuna://widget/pair", O)).toEqual({ action: "block" });
    expect(decideNavigation("kizuna://widget/other?code=ABCD1234", O)).toEqual({ action: "block" });
  });
  it("routes kizuna://app/<path> to the app route that opens the path in the WebView", () => {
    jest.spyOn(Date, "now").mockReturnValue(3);
    expect(decideNavigation("kizuna://app/habitos/3f2a", O)).toEqual({ action: "native", href: "/?path=%2Fhabitos%2F3f2a&n=3" });
    expect(decideNavigation("kizuna://app/retos/9", O)).toEqual({ action: "native", href: "/?path=%2Fretos%2F9&n=3" });
    expect(decideNavigation("kizuna://app/a/../b", O)).toEqual({ action: "block" });
  });
});

describe("web session signals", () => {
  it("landing on /login means the handoff was not accepted (expired or used)", () => {
    expect(isExpiredLanding("https://kizuna.example/login", O)).toBe(true);
    expect(isExpiredLanding("https://kizuna.example/login?next=%2F", O)).toBe(true);
    expect(isExpiredLanding("https://kizuna.example/retos", O)).toBe(false);
    expect(isExpiredLanding("https://evil.com/login", O)).toBe(false);
  });
  it("landing on /bienvenida means the web signed the user out", () => {
    expect(isWebSignedOut("https://kizuna.example/bienvenida", O)).toBe(true);
    expect(isWebSignedOut("https://kizuna.example/perfil", O)).toBe(false);
    expect(isWebSignedOut("https://evil.com/bienvenida", O)).toBe(false);
  });
  it("registration is over once the WebView leaves /registro and /legal", () => {
    expect(registroOutcome("https://kizuna.example/registro", O)).toBe("stay");
    expect(registroOutcome("https://kizuna.example/registro?next=%2Finvite%2Fabc", O)).toBe("stay");
    expect(registroOutcome("https://kizuna.example/legal/terminos", O)).toBe("stay");
    expect(registroOutcome("https://kizuna.example/bienvenida", O)).toBe("done");
    expect(registroOutcome("https://kizuna.example/login?creada=1", O)).toBe("done");
    expect(registroOutcome("https://kizuna.example/", O)).toBe("done");
  });
});

describe("nativeUserAgentName", () => {
  it("is KizunaNative/<major of the app version>", () => {
    expect(nativeUserAgentName("1.1.1")).toBe("KizunaNative/1");
    expect(nativeUserAgentName("2.0.0")).toBe("KizunaNative/2");
    expect(nativeUserAgentName(undefined)).toBe("KizunaNative/1");
  });
});

describe("parseBackReply (the only message the app accepts from the page)", () => {
  const O = "https://kizuna.example";
  const ok = JSON.stringify({ t: "kizuna.back", id: 4, handled: true });
  it("accepts the exact shape from the web origin", () => {
    expect(parseBackReply(ok, `${O}/retos`, O)).toEqual({ id: 4, handled: true });
    expect(parseBackReply(JSON.stringify({ t: "kizuna.back", id: 0, handled: false }), `${O}/`, O)).toEqual({ id: 0, handled: false });
  });
  it("refuses another origin, a non-https page, credentials and a missing url", () => {
    expect(parseBackReply(ok, "https://evil.com/", O)).toBeNull();
    expect(parseBackReply(ok, "http://kizuna.example/", O)).toBeNull();
    expect(parseBackReply(ok, "https://u:p@kizuna.example/", O)).toBeNull();
    expect(parseBackReply(ok, "", O)).toBeNull();
    expect(parseBackReply(ok, undefined as unknown as string, O)).toBeNull();
  });
  it("refuses anything but the known shape", () => {
    const u = `${O}/`;
    for (const bad of [
      "not json",
      "null",
      "[]",
      '"kizuna.back"',
      JSON.stringify({ t: "other", id: 1, handled: true }),
      JSON.stringify({ t: "kizuna.back", id: "1", handled: true }),
      JSON.stringify({ t: "kizuna.back", id: 1.5, handled: true }),
      JSON.stringify({ t: "kizuna.back", id: -1, handled: true }),
      JSON.stringify({ t: "kizuna.back", id: 1, handled: "yes" }),
      JSON.stringify({ t: "kizuna.back", id: 1 }),
      JSON.stringify({ t: "kizuna.back", id: 1, handled: true, extra: "x" }),
      "x".repeat(5000),
    ])
      expect(parseBackReply(bad, u, O)).toBeNull();
    expect(parseBackReply(undefined as unknown as string, u, O)).toBeNull();
  });
});
