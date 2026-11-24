import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES as FROM_CHECKINS, PHOTO_TARGET_MB as TARGET_FROM_CHECKINS, photoCheckin } from "@/lib/checkins";
import { MAX_PHOTO_BYTES, PHOTO_NOT_JPEG, PHOTO_SEND_FAILED, PHOTO_TARGET_MB, PHOTO_TOO_BIG } from "@/lib/photo-copy";

describe("photo copy", () => {
  it("is the one source of the limits and the Spanish copy the web route answers with", async () => {
    expect(MAX_PHOTO_BYTES).toBe(4 * 1024 * 1024);
    expect(FROM_CHECKINS).toBe(MAX_PHOTO_BYTES);
    expect(TARGET_FROM_CHECKINS).toBe(PHOTO_TARGET_MB);
    expect(PHOTO_TOO_BIG).toBe("La foto pesa demasiado. Prueba con otra o toma una nueva.");
    expect(PHOTO_NOT_JPEG).toBe("La foto debe ser una imagen JPEG.");
    expect(PHOTO_SEND_FAILED).toBe("No pudimos enviar la foto. Inténtalo de nuevo.");
    // the route's own refusals use these strings
    const deps = { getProfile: async () => ({ timezone: "UTC", deleted_at: null }) } as never;
    const big = await photoCheckin(deps, "u", { kind: "habit", habitId: "h" }, { bytes: new ArrayBuffer(8), type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 }, new Date());
    expect(big).toEqual({ status: 413, error: PHOTO_TOO_BIG });
    const png = await photoCheckin(deps, "u", { kind: "habit", habitId: "h" }, { bytes: new ArrayBuffer(8), type: "image/png", size: 8 }, new Date());
    expect(png).toEqual({ status: 415, error: PHOTO_NOT_JPEG });
  });
});
