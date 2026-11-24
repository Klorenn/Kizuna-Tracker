import { pomodoroPathOf } from "./notification-path";

describe("pomodoroPathOf", () => {
  it("accepts only the pomodoro screen of a habit", () => {
    expect(pomodoroPathOf({ url: "/registros/ht/pomodoro" })).toBe("/registros/ht/pomodoro");
    expect(pomodoroPathOf({ url: "/registros/3f2a-bc/pomodoro" })).toBe("/registros/3f2a-bc/pomodoro");
  });
  it("ignores anything else (other pushes are routed by the push handler)", () => {
    expect(pomodoroPathOf({ url: "/retos/123" })).toBeNull();
    expect(pomodoroPathOf({ url: "/registros/../pomodoro" })).toBeNull();
    expect(pomodoroPathOf({ url: "//evil.com/registros/x/pomodoro" })).toBeNull();
    expect(pomodoroPathOf({ url: 5 })).toBeNull();
    expect(pomodoroPathOf(undefined)).toBeNull();
    expect(pomodoroPathOf(null)).toBeNull();
  });
});
