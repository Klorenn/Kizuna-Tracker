import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const adminRpc = vi.fn();
const createUser = vi.fn();
const signUp = vi.fn();
const signInWithPassword = vi.fn();
const serviceKey = vi.fn();
const skip = vi.fn();
const profileUsername = vi.fn();
const serverSignOut = vi.fn();
const cookieDelete = vi.fn();
const cookieJar = vi.fn();

class Redirect extends Error {
  constructor(public to: string) {
    super("redirect");
  }
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "9.9.9.9" }),
  cookies: async () => ({ getAll: () => cookieJar(), delete: cookieDelete }),
}));
// Next's redirect() throws; this flag makes it return instead, to prove no code runs after it
let redirectReturns = false;
const redirected: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    if (redirectReturns) {
      redirected.push(to);
      return;
    }
    throw new Redirect(to);
  },
}));
vi.mock("@/lib/rate-limit-mode", () => ({ skipRateLimit: () => skip() }));
vi.mock("@/lib/supabase/env.server", () => ({ supabaseServiceKey: () => serviceKey() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: adminRpc,
    auth: { admin: { createUser } },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: profileUsername(), error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { signUp, signInWithPassword, signOut: serverSignOut } }),
}));

import { signUp as signUpAction } from "@/app/(auth)/registro/actions";

const INPUT = {
  firstName: "Carolina",
  lastName: "Méndez",
  birthDate: "1998-03-14",
  username: "caro_m",
  email: "Caro@Example.com",
  password: "kizuna-2026",
  passwordConfirm: "kizuna-2026",
  acceptTerms: true,
  timezone: "UTC",
  avatarPreset: 3,
};
const META = {
  first_name: "Carolina",
  last_name: "Méndez",
  birth_date: "1998-03-14",
  username: "caro_m",
  timezone: "UTC",
  terms_accepted: true,
  avatar_preset: 3,
};
const GENERIC = "No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.";

async function run() {
  try {
    return await signUpAction(INPUT);
  } catch (e) {
    if (e instanceof Redirect) return { redirect: e.to };
    throw e;
  }
}

beforeEach(() => {
  for (const m of [adminRpc, createUser, signUp, signInWithPassword, serviceKey, skip, profileUsername, serverSignOut, cookieDelete, cookieJar]) m.mockReset();
  order.length = 0;
  redirectReturns = false;
  redirected.length = 0;
  cookieJar.mockReturnValue([{ name: 'sb-abc-auth-token' }, { name: 'sb-abc-auth-token.1' }, { name: 'theme' }]);
  skip.mockReturnValue(false);
  serviceKey.mockReturnValue("svc");
  adminRpc.mockImplementation(async (name: string) => {
    order.push(`rpc:${name}`);
    return { data: true, error: null };
  });
  createUser.mockImplementation(async () => {
    order.push("createUser");
    return { data: { user: { id: "u" } }, error: null };
  });
  signInWithPassword.mockImplementation(async () => {
    order.push("signIn");
    return { error: null };
  });
});

describe("signUp with a service key", () => {
  it("creates a confirmed user, signs in, then redirects to /listo", async () => {
    expect(await run()).toEqual({ redirect: "/listo" });
    expect(createUser).toHaveBeenCalledWith({
      email: "caro@example.com",
      password: "kizuna-2026",
      email_confirm: true,
      user_metadata: META,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "caro@example.com", password: "kizuna-2026" });
    expect(signUp).not.toHaveBeenCalled();
    expect(order).toEqual(["rpc:register_login_attempt", "rpc:username_available", "createUser", "signIn"]);
  });

  it("rate limiter blocks before any account is created", async () => {
    adminRpc.mockImplementation(async (name: string) => ({ data: name === "register_login_attempt" ? false : true, error: null }));
    const res = await run();
    expect(res).toMatchObject({ ok: false });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("e-mail already registered gives the generic line", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "email_exists", code: "email_exists" } });
    expect(await run()).toEqual({ ok: false, error: GENERIC });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("handle taken through the trigger error maps to the taken message", async () => {
    let usernameCalls = 0;
    adminRpc.mockImplementation(async (name: string) => {
      if (name === "username_available") return { data: ++usernameCalls === 1, error: null };
      return { data: true, error: null };
    });
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "Database error creating new user" } });
    expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
  });

  describe("a lost createUser response (the account exists but the handle now reads as taken)", () => {
    const lostResponse = () => {
      let calls = 0;
      adminRpc.mockImplementation(async (name: string) => {
        if (name === "username_available") return { data: ++calls === 1, error: null };
        return { data: true, error: null };
      });
      createUser.mockResolvedValue({ data: { user: null }, error: { message: "timeout" } });
    };
    it("signing in with the submitted e-mail and password as the owner of that handle goes on to /listo", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-me" } }, error: null });
      profileUsername.mockReturnValue({ username: "caro_m" });
      expect(await run()).toEqual({ redirect: "/listo" });
      expect(signInWithPassword).toHaveBeenCalledWith({ email: "caro@example.com", password: "kizuna-2026" });
    });
    it("the recovery sign-in counts against the per-account login limit (id:<email>) before it runs", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-me" } }, error: null });
      profileUsername.mockReturnValue({ username: "caro_m" });
      await run();
      const keyed = adminRpc.mock.calls.filter(([n, a]) => n === "register_login_attempt" && a.p_keys.includes("id:caro@example.com"));
      expect(keyed).toHaveLength(1);
      const keyedIdx = adminRpc.mock.calls.findIndex(([n, a]) => n === "register_login_attempt" && a.p_keys.includes("id:caro@example.com"));
      expect(adminRpc.mock.invocationCallOrder[keyedIdx]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]);
    });
    it("a blocked key skips the sign-in and shows the taken message", async () => {
      let calls = 0;
      adminRpc.mockImplementation(async (name: string, args: { p_keys?: string[] }) => {
        if (name === "username_available") return { data: ++calls === 1, error: null };
        if (name === "register_login_attempt") return { data: !args.p_keys?.includes("id:caro@example.com"), error: null };
        return { data: true, error: null };
      });
      createUser.mockResolvedValue({ data: { user: null }, error: { message: "timeout" } });
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
      expect(signInWithPassword).not.toHaveBeenCalled();
    });
    it("a different handle signs out with scope local only (never every device) and leaves no session cookie", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-other" } }, error: null });
      profileUsername.mockReturnValue({ username: "someone_else" });
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
      expect(serverSignOut).toHaveBeenCalledWith({ scope: "local" });
      expect(cookieDelete.mock.calls.map((c) => c[0]).sort()).toEqual(["sb-abc-auth-token", "sb-abc-auth-token.1"]);
    });
    it("a failing sign-out still clears the other account's session cookies", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-other" } }, error: null });
      profileUsername.mockReturnValue({ username: "someone_else" });
      serverSignOut.mockRejectedValue(new TypeError("fetch failed"));
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
      expect(cookieDelete).toHaveBeenCalledWith("sb-abc-auth-token");
    });
    it("the real owner keeps the session cookies (nothing is cleared)", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-me" } }, error: null });
      profileUsername.mockReturnValue({ username: "caro_m" });
      expect(await run()).toEqual({ redirect: "/listo" });
      expect(cookieDelete).not.toHaveBeenCalled();
      expect(serverSignOut).not.toHaveBeenCalled();
    });
    it("a wrong password for that e-mail keeps the taken message and reveals nothing", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
    });
    it("an account of this e-mail that owns a different handle keeps the taken message and is signed out", async () => {
      lostResponse();
      signInWithPassword.mockResolvedValue({ data: { user: { id: "u-other" } }, error: null });
      profileUsername.mockReturnValue({ username: "someone_else" });
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
      expect(serverSignOut).toHaveBeenCalledTimes(1);
    });
    it("a sign-in that throws keeps the taken message", async () => {
      lostResponse();
      signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
      expect(await run()).toEqual({ ok: false, error: "Ese usuario ya está en uso." });
    });
  });

  it("password rejected by policy gives the generic line", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "weak_password", message: "weak" } });
    expect(await run()).toEqual({ ok: false, error: GENERIC });
  });

  it("sign-in throwing after creation (network) also ends at /login with the notice", async () => {
    signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    expect(await run()).toEqual({ redirect: "/login?notice=cuenta-lista" });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });
  it("sign-in failing after creation sends the person to /login with a notice, no retry", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "x" } });
    expect(await run()).toEqual({ redirect: "/login?notice=cuenta-lista" });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledTimes(1);
  });
});

describe("with a service key the non-admin fallback can never run", () => {
  it.each([
    ["the account is created and the session opens", () => {}],
    ["the sign-in after creation fails", () => signInWithPassword.mockResolvedValue({ error: { message: "x" } })],
    ["the sign-in after creation throws", () => signInWithPassword.mockRejectedValue(new TypeError("fetch failed"))],
    ["createUser fails and the handle is free", () => createUser.mockResolvedValue({ data: { user: null }, error: { message: "boom" } })],
    [
      "createUser fails and the handle reads as taken",
      () => {
        createUser.mockResolvedValue({ data: { user: null }, error: { message: "dup" } });
        adminRpc.mockImplementation(async (name: string) => ({
          data: name === "username_available" ? (adminRpc.mock.calls.filter((c) => c[0] === "username_available").length <= 1) : true,
          error: null,
        }));
      },
    ],
  ])("even if redirect() returned instead of throwing: %s", async (_name, arrange) => {
    redirectReturns = true;
    arrange();
    await signUpAction(INPUT);
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("signUp without a service key", () => {
  it("keeps the auth.signUp path", async () => {
    serviceKey.mockReturnValue(null);
    signUp.mockResolvedValue({ data: { session: {} }, error: null });
    expect(await run()).toEqual({ redirect: "/listo" });
    expect(createUser).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledWith({
      email: "caro@example.com",
      password: "kizuna-2026",
      options: { data: META },
    });
  });
});

describe("sign-up from an invitation keeps the invitation (the return path is validated server-side)", () => {
  const INVITE = "/g/K7QM4PXD";
  async function runNext(next: unknown) {
    try {
      return await signUpAction(INPUT, next as string | null);
    } catch (e) {
      if (e instanceof Redirect) return { redirect: e.to };
      throw e;
    }
  }
  it("a created account with a session ends back on the invitation, not on /listo", async () => {
    expect(await runNext(INVITE)).toEqual({ redirect: INVITE });
  });
  it("no return path (null, undefined): /listo as today", async () => {
    expect(await runNext(null)).toEqual({ redirect: "/listo" });
    expect(await signUpAction(INPUT).catch((e) => ({ redirect: (e as Redirect).to }))).toEqual({ redirect: "/listo" });
  });
  it.each(["https://evil.com", "//evil.com", "//evil.com/g/K7QM4PXD", "/\\evil.com", "/hoy", "/g/k7qm4pxd", "javascript:alert(1)", 42, {}, ""])(
    "a hostile or rejected return path (%j) ends on /listo",
    async (hostile) => {
      expect(await runNext(hostile)).toEqual({ redirect: "/listo" });
    },
  );
  it("the lost-response recovery (owner signs in) also returns to the invitation", async () => {
    let calls = 0;
    adminRpc.mockImplementation(async (name: string) => (name === "username_available" ? { data: ++calls === 1, error: null } : { data: true, error: null }));
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "timeout" } });
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u-me" } }, error: null });
    profileUsername.mockReturnValue({ username: "caro_m" });
    expect(await runNext(INVITE)).toEqual({ redirect: INVITE });
  });
  it("account created but the session did not open: login keeps the invitation", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "x" } });
    expect(await runNext(INVITE)).toEqual({ redirect: "/login?notice=cuenta-lista&next=%2Fg%2FK7QM4PXD" });
    signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    expect(await runNext(INVITE)).toEqual({ redirect: "/login?notice=cuenta-lista&next=%2Fg%2FK7QM4PXD" });
    expect(await runNext("https://evil.com")).toEqual({ redirect: "/login?notice=cuenta-lista" });
  });
  it("without a service key the auth.signUp path returns to the invitation too", async () => {
    serviceKey.mockReturnValue(null);
    signUp.mockResolvedValue({ data: { session: {} }, error: null });
    expect(await runNext(INVITE)).toEqual({ redirect: INVITE });
  });
});
