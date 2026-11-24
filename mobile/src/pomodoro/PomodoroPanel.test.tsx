import { fireEvent, render, screen } from "@testing-library/react-native";
import { initialPomodoro, pomodoroReducer, type PomodoroState, type TimerMode } from "@/domain/pomodoro";
import { DEFAULT_POMODORO_PREFS, EMPTY_SESSION, type PomodoroBox, type PomodoroPrefs } from "@/lib/pomodoro-core";
import { m2Row } from "../today/test-fixtures";
import { PomodoroPanel } from "./PomodoroPanel";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const ids: [string, string, string] = ["a", "b", "c"];

const handlers = () => ({
  onMode: jest.fn(),
  onStart: jest.fn(),
  onStartMeasure: jest.fn(),
  onPickTimerMin: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onSkip: jest.fn(),
  onFinish: jest.fn(),
  onNext: jest.fn(),
  onReset: jest.fn(),
  onMute: jest.fn(),
  onBack: jest.fn(),
});
const idleBox = (mode: TimerMode = "pomodoro", cycles: number | null = 4): PomodoroBox => ({
  s: initialPomodoro("ht", { focusMin: mode === "timer" ? 25 : 25, breakMin: 5, cycles }, mode),
  session: EMPTY_SESSION,
});
const running = (mode: TimerMode = "pomodoro"): PomodoroState =>
  pomodoroReducer(initialPomodoro("ht", { focusMin: 25, breakMin: 5, cycles: 4 }, mode), { type: "start", at: T0, blockId: "b1", blockIds: ids });
const view = async (box: PomodoroBox, now = T0, extra: Partial<{ prefs: PomodoroPrefs; notice: string | null; todayMinutes: number }> = {}) => {
  const h = handlers();
  const utils = await render(<PomodoroPanel row={m2Row("ht")} box={box} prefs={extra.prefs ?? DEFAULT_POMODORO_PREFS} now={now} todayMinutes={extra.todayMinutes ?? 0} notice={extra.notice ?? null} {...h} />);
  return { h, ...utils };
};

describe("PomodoroPanel: rounds, breaks, pause, timer and stopwatch", () => {
  it("idle pomodoro: the saved preset starts with its focus, break and rounds", async () => {
    const { h } = await view(idleBox());
    expect(screen.getByText("25/5")).toBeTruthy();
    expect(screen.getByText("50/10")).toBeTruthy();
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(h.onStart).toHaveBeenCalledWith({ focusMin: 25, breakMin: 5, cycles: 4 }, "25-5", "");
  });
  it("another preset, more rounds, no limit and a topic reach the start call", async () => {
    const { h } = await view(idleBox());
    await fireEvent.press(screen.getByText("50/10"));
    await fireEvent.press(screen.getByLabelText("Más rondas"));
    await fireEvent.changeText(screen.getByLabelText("Tema"), "Cálculo");
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(h.onStart).toHaveBeenCalledWith({ focusMin: 50, breakMin: 10, cycles: 5 }, "50-10", "Cálculo");
    await fireEvent.press(screen.getByLabelText("Sin límite"));
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(h.onStart).toHaveBeenLastCalledWith({ focusMin: 50, breakMin: 10, cycles: null }, "50-10", "Cálculo");
  });
  it("custom lengths are validated with the web copy and nothing starts", async () => {
    const { h } = await view(idleBox());
    await fireEvent.press(screen.getByText("Personalizado"));
    await fireEvent.changeText(screen.getByLabelText("Foco (min)"), "3");
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(screen.getByText("El foco va de 5 a 90 minutos.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Foco (min)"), "30");
    await fireEvent.changeText(screen.getByLabelText("Descanso (min)"), "45");
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(screen.getByText("El descanso va de 1 a 30 minutos.")).toBeTruthy();
    expect(h.onStart).not.toHaveBeenCalled();
  });
  it("a topic over 60 characters is refused with the web copy", async () => {
    const { h } = await view(idleBox());
    await fireEvent.changeText(screen.getByLabelText("Tema"), "x".repeat(61));
    await fireEvent.press(screen.getByText("Empezar foco"));
    expect(screen.getByText("El tema tiene hasta 60 caracteres.")).toBeTruthy();
    expect(h.onStart).not.toHaveBeenCalled();
  });
  it("focus: round label, countdown from the stored start, pause, skip and finish now", async () => {
    const { h } = await view({ s: running(), session: EMPTY_SESSION }, T0 + MIN);
    expect(screen.getByText("Foco · ronda 1 de 4")).toBeTruthy();
    expect(screen.getByText("24:00")).toBeTruthy();
    await fireEvent.press(screen.getByText("Pausar"));
    await fireEvent.press(screen.getByText("Saltar"));
    await fireEvent.press(screen.getByText("Terminar ahora"));
    expect(h.onPause).toHaveBeenCalled();
    expect(h.onSkip).toHaveBeenCalled();
    expect(h.onFinish).toHaveBeenCalled();
  });
  it("paused: says so, freezes at the pause instant and offers to resume", async () => {
    const paused = pomodoroReducer(running(), { type: "pause", at: T0 + 10 * MIN });
    const { h } = await view({ s: paused, session: EMPTY_SESSION }, T0 + 20 * MIN);
    expect(screen.getByText("15:00")).toBeTruthy();
    expect(screen.getByText("En pausa.")).toBeTruthy();
    expect(screen.queryByText("Pausar")).toBeNull();
    await fireEvent.press(screen.getByText("Reanudar"));
    expect(h.onResume).toHaveBeenCalled();
  });
  it("break: rest label, remaining time, what the server said about the block, skip the rest", async () => {
    const closed = pomodoroReducer(running(), { type: "tick", at: T0 + 26 * MIN });
    const box: PomodoroBox = { s: closed, session: { blocks: 1, minutes: 25, last: 25, lastId: "b1", lastStatus: "confirmed" } };
    const { h } = await view(box, T0 + 26 * MIN, {});
    expect(screen.getByText("Descanso")).toBeTruthy();
    expect(screen.getByText("04:00")).toBeTruthy();
    expect(screen.getByText("Sumamos 25 min a Estudio.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Saltar descanso"));
    expect(h.onSkip).toHaveBeenCalled();
  });
  it("ready: next round or finish", async () => {
    const ready = pomodoroReducer(running(), { type: "tick", at: T0 + 31 * MIN });
    const { h } = await view({ s: ready, session: EMPTY_SESSION }, T0 + 31 * MIN);
    expect(ready.phase).toBe("ready");
    expect(screen.getByText("Descanso terminado.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Siguiente ronda"));
    expect(h.onNext).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Terminar"));
    expect(h.onFinish).toHaveBeenCalled();
  });
  it("done: the session summary, today's total, another session", async () => {
    const done = pomodoroReducer(running(), { type: "finish", at: T0 + 25 * MIN });
    const box: PomodoroBox = { s: done, session: { blocks: 1, minutes: 25, last: 25, lastId: "b1", lastStatus: "pending" } };
    const { h } = await view(box, T0 + 26 * MIN, { todayMinutes: 55 });
    expect(screen.getByText("1 pomodoro · 25 min")).toBeTruthy();
    expect(screen.getByText("Hoy: 55 min")).toBeTruthy();
    await fireEvent.press(screen.getByText("Otra sesión"));
    expect(h.onReset).toHaveBeenCalled();
  });
  it("pending blocks are announced while a focus runs", async () => {
    const withPending: PomodoroState = { ...running(), pending: [{ blockId: "old", minutes: 25, endedAt: T0 - MIN }] };
    await view({ s: withPending, session: EMPTY_SESSION }, T0 + MIN);
    expect(screen.getByText("Pendiente de sumar.")).toBeTruthy();
  });
  it("mode switch changes the mode while idle", async () => {
    const idle = await view(idleBox());
    await fireEvent.press(screen.getByText("Temporizador"));
    expect(idle.h.onMode).toHaveBeenCalledWith("timer");
  });
  it("mode switch is locked, with a hint, while a session runs", async () => {
    const run = await view({ s: running(), session: EMPTY_SESSION }, T0 + MIN);
    await fireEvent.press(screen.getByText("Cronómetro"));
    expect(run.h.onMode).not.toHaveBeenCalled();
    expect(screen.getByText("Termina la sesión para cambiar de modo.")).toBeTruthy();
  });
  it("timer idle: chips pick minutes, a custom value is range checked, Empezar starts with the topic", async () => {
    const { h } = await view(idleBox("timer"), T0, { prefs: { ...DEFAULT_POMODORO_PREFS, mode: "timer", timerMin: 25 } });
    await fireEvent.press(screen.getByLabelText("45 minutos"));
    expect(h.onPickTimerMin).toHaveBeenCalledWith(45);
    await fireEvent.press(screen.getByText("Otro"));
    await fireEvent.changeText(screen.getByLabelText("Minutos (1 a 90)"), "0");
    expect(screen.getByText("Elige entre 1 y 90 minutos.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Empezar"));
    expect(h.onStartMeasure).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Minutos (1 a 90)"), "50");
    expect(h.onPickTimerMin).toHaveBeenLastCalledWith(50);
    await fireEvent.changeText(screen.getByLabelText("Tema"), "Lectura");
    await fireEvent.press(screen.getByText("Empezar"));
    expect(h.onStartMeasure).toHaveBeenCalledWith("Lectura");
  });
  it("stopwatch idle explains the 90-minute blocks and the 4 hour cap; running counts up past an hour", async () => {
    await view(idleBox("stopwatch"), T0, { prefs: { ...DEFAULT_POMODORO_PREFS, mode: "stopwatch" } });
    expect(screen.getByText(/Cada 90 minutos se guarda un bloque y se detiene a las 4 horas/)).toBeTruthy();
    expect(screen.getByText("Empezar")).toBeTruthy();
  });
  it("stopwatch running: the elapsed time with hours, pause and finish", async () => {
    const { h } = await view({ s: running("stopwatch"), session: EMPTY_SESSION }, T0 + 65 * MIN + 9000);
    expect(screen.getByText("1:05:09")).toBeTruthy();
    await fireEvent.press(screen.getByText("Terminar"));
    expect(h.onFinish).toHaveBeenCalled();
  });
  it("timer finished early under a minute says so", async () => {
    const short = pomodoroReducer(running("timer"), { type: "finish", at: T0 + 20_000 });
    await view({ s: short, session: EMPTY_SESSION }, T0 + 21_000);
    expect(screen.getByText("Menos de un minuto no se suma.")).toBeTruthy();
  });
  it("notice, mute toggle and a missing habit", async () => {
    const { h, rerender } = await view(idleBox(), T0, { notice: "Un bloque terminó ayer y ya no se puede sumar." });
    expect(screen.getByText("Un bloque terminó ayer y ya no se puede sumar.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Silenciar avisos"));
    expect(h.onMute).toHaveBeenCalled();
    await rerender(<PomodoroPanel row={null} box={idleBox()} prefs={DEFAULT_POMODORO_PREFS} now={T0} todayMinutes={0} notice={null} {...h} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
  });
});
