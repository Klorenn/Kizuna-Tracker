import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const adminRpc = vi.fn();
const createUser = vi.fn();
const signUp = vi.fn();
const signInWithPassword = vi.fn();
const serviceKey = vi.fn();
const skip = vi.fn();

class Redirect extends Error {
  constructor(public to: string) {
    super("redirect");
  }
}

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "9.9.9.9" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("@/lib/rate-limit-mode", () => ({ skipRateLimit: () => skip() }));
vi.mock("@/lib/supabase/env.server", () => ({ supabaseServiceKey: () => serviceKey() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: adminRpc, auth: { admin: { createUser } } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { signUp, signInWithPassword } }),
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
  for (const m of [adminRpc, createUser, signUp, signInWithPassword, serviceKey, skip]) m.mockReset();
  order.length = 0;
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

  it("password rejected by policy gives the generic line", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: "weak_password", message: "weak" } });
    expect(await run()).toEqual({ ok: false, error: GENERIC });
  });

  it("sign-in failing after creation sends the person to /login with a notice, no retry", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "x" } });
    expect(await run()).toEqual({ redirect: "/login?notice=cuenta-lista" });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledTimes(1);
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
