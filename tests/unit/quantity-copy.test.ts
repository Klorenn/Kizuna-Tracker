import { describe, expect, it } from "vitest";
import { QUANTITY_GENERIC, QUANTITY_MESSAGES, isQuantityNetwork, quantityMessageFor } from "@/lib/quantity-copy";
import { QUANTITY_MESSAGES as REEXPORT } from "@/lib/quantity-queue";

describe("quantity copy", () => {
  it("maps server codes to Spanish", () => {
    expect(quantityMessageFor({ message: "amount_over_day" })).toBe("Es demasiado para un día.");
    expect(quantityMessageFor({ message: "entry_not_found" })).toBe(QUANTITY_MESSAGES.notFound);
    expect(quantityMessageFor({ message: "boom" })).toBe(QUANTITY_GENERIC);
    expect(quantityMessageFor(null)).toBe(QUANTITY_GENERIC);
  });
  it("tells a network failure from a coded refusal", () => {
    expect(isQuantityNetwork({ message: "Failed to fetch" })).toBe(true);
    expect(isQuantityNetwork({ message: "invalid_amount timeout" })).toBe(false);
    expect(isQuantityNetwork(null)).toBe(false);
  });
  it("quantity-queue keeps exporting the messages", () => {
    expect(REEXPORT).toBe(QUANTITY_MESSAGES);
    expect(QUANTITY_MESSAGES.offlineAdd).toBe("Sin conexión. Guardaremos la suma cuando vuelvas a estar en línea.");
  });
});
