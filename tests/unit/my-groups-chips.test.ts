import { describe, expect, it } from "vitest";
import { chipsFromMyGroupsRows } from "@/domain/my-groups-chips";

const row = (o: Record<string, unknown>) => ({ id: "g1", name: "Corremos", color: "cielo", archived: false, my_habit_id: "h1", ...o });

describe("chipsFromMyGroupsRows", () => {
  it("maps live groups with a linked habit to habit id -> name and color", () => {
    expect([...chipsFromMyGroupsRows([row({})]).entries()]).toEqual([["h1", { name: "Corremos", color: "cielo" }]]);
  });
  it("skips archived groups and groups without a linked habit", () => {
    const rows = [row({ archived: true }), row({ id: "g2", my_habit_id: null }), row({ id: "g3", my_habit_id: "h3", name: "Lectura" })];
    expect([...chipsFromMyGroupsRows(rows).keys()]).toEqual(["h3"]);
  });
  it("is empty for anything that is not a list of rows", () => {
    expect(chipsFromMyGroupsRows(null).size).toBe(0);
    expect(chipsFromMyGroupsRows({}).size).toBe(0);
    expect(chipsFromMyGroupsRows([null, 3, { name: 1 }]).size).toBe(0);
  });
});
