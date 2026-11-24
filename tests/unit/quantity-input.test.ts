import { describe, expect, it } from "vitest";
import { TYPED_AMOUNT_COPY, parseTypedAmount, parseTypedAmountResult } from "@/lib/quantity-input";
import * as queue from "@/lib/quantity-queue";
import type { QuantityConfig } from "@/domain/quantity";

const ml: QuantityConfig = { unit: "ml", label: null, target: 2000, step: 250, display: "base", glassMl: null } as never;
const km: QuantityConfig = { unit: "km", label: null, target: 5, step: 1, display: "base", glassMl: null } as never;

describe("quantity-input (shared by web and native)", () => {
  it("parses es-CL whole numbers with thousands dots", () => {
    expect(parseTypedAmount("1.250", ml)).toBe(1250);
    expect(parseTypedAmountResult("1.5", ml)).toEqual({ ok: false, error: TYPED_AMOUNT_COPY.whole });
  });
  it("decimal units: one dot and 1-2 digits is a decimal, 3 is ambiguous", () => {
    expect(parseTypedAmount("1,5", km)).toBe(1.5);
    expect(parseTypedAmountResult("10.000", km)).toEqual({ ok: false, error: TYPED_AMOUNT_COPY.ambiguous });
    expect(parseTypedAmountResult("abc", km)).toEqual({ ok: false, error: TYPED_AMOUNT_COPY.invalid });
  });
  it("quantity-queue still re-exports the same functions", () => {
    expect(queue.parseTypedAmount).toBe(parseTypedAmount);
    expect(queue.parseTypedAmountResult).toBe(parseTypedAmountResult);
    expect(queue.TYPED_AMOUNT_COPY).toBe(TYPED_AMOUNT_COPY);
  });
});
