import { createNotificationScheduler } from "./notifications";

const make = (perm: { granted: boolean; canAskAgain: boolean }, requested = { granted: true }) => {
  const api = {
    getPermissionsAsync: jest.fn().mockResolvedValue(perm),
    requestPermissionsAsync: jest.fn().mockResolvedValue(requested),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue("id-1"),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  };
  return { api, scheduler: createNotificationScheduler(api as never) };
};

describe("notification scheduler", () => {
  it("schedules a date trigger on the pomodoro channel whose tap opens the pomodoro screen", async () => {
    const { api, scheduler } = make({ granted: true, canAskAgain: true });
    const at = Date.UTC(2026, 10, 25, 15, 25);
    await expect(scheduler.schedule({ at, habitId: "ht", minutes: 25 })).resolves.toBe("id-1");
    expect(api.setNotificationChannelAsync).toHaveBeenCalledWith("pomodoro", expect.objectContaining({ name: "Pomodoro" }));
    const arg = api.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.trigger).toMatchObject({ type: "date", date: new Date(at), channelId: "pomodoro" });
    expect(arg.content.data).toEqual({ url: "/registros/ht/pomodoro" });
    expect(arg.content.title).toBe("Pomodoro terminado");
    expect(arg.content.body).toBe("Guarda tu bloque de 25 min.");
  });
  it("asks for permission in context when it can, and schedules once granted", async () => {
    const { api, scheduler } = make({ granted: false, canAskAgain: true });
    await scheduler.schedule({ at: 1, habitId: "h", minutes: 5 });
    expect(api.requestPermissionsAsync).toHaveBeenCalled();
    expect(api.scheduleNotificationAsync).toHaveBeenCalled();
  });
  it("without permission the timer still works: no notification, null id, no re-prompt when it cannot ask", async () => {
    const { api, scheduler } = make({ granted: false, canAskAgain: false });
    await expect(scheduler.schedule({ at: 1, habitId: "h", minutes: 5 })).resolves.toBeNull();
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it("a scheduling failure is a null id, never a thrown error; cancel is safe", async () => {
    const { api, scheduler } = make({ granted: true, canAskAgain: true });
    api.scheduleNotificationAsync.mockRejectedValue(new Error("boom"));
    await expect(scheduler.schedule({ at: 1, habitId: "h", minutes: 5 })).resolves.toBeNull();
    await scheduler.cancel("x");
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledWith("x");
    api.cancelScheduledNotificationAsync.mockRejectedValue(new Error("gone"));
    await expect(scheduler.cancel("y")).resolves.toBeUndefined();
  });
});
