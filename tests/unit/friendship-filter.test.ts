import { describe, expect, it } from "vitest";
import { friendshipPairFilter } from "@/lib/friendship-filter";

describe("friendshipPairFilter (PostgREST or() between two people, either direction)", () => {
  it("names both people in both directions, with no empty id", () => {
    expect(friendshipPairFilter("me-1", "them-2")).toBe(
      "and(requester_id.eq.me-1,addressee_id.eq.them-2),and(requester_id.eq.them-2,addressee_id.eq.me-1)",
    );
  });
  it("never produces an empty operand (the bug a template-string slip once caused)", () => {
    expect(friendshipPairFilter("a", "b")).not.toMatch(/\.eq\.[,)]/);
  });
});
