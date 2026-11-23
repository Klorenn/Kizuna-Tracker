import { describe, expect, it } from "vitest";
import { redirect } from "next/navigation";
import { CONNECTION_ERROR, safeAction } from "@/lib/safe-action";

describe("safeAction", () => {
  it("returns the value of a resolved action", async () => {
    expect(await safeAction(async () => ({ ok: false, error: "Ese usuario ya está en uso." }))).toEqual({
      ok: true,
      value: { ok: false, error: "Ese usuario ya está en uso." },
    });
  });
  it("turns a plain rejection into the connection message", async () => {
    expect(
      await safeAction(async () => {
        throw new Error("fetch failed");
      }),
    ).toEqual({ ok: false, error: CONNECTION_ERROR });
  });
  it("does not convert a redirect thrown by the action into the connection message", async () => {
    await expect(
      safeAction(async () => {
        redirect("/listo");
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});
