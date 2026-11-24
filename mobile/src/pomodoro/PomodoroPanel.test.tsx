import { fireEvent, render, screen } from "@testing-library/react-native";
import { m2Row } from "../today/test-fixtures";
import { PomodoroPanel } from "./PomodoroPanel";

const handlers = () => ({ onStart: jest.fn(), onCancel: jest.fn(), onSave: jest.fn(), onBack: jest.fn() });
const MIN = 60_000;

describe("PomodoroPanel", () => {
  it("idle: pick a length and start", async () => {
    const h = handlers();
    await render(<PomodoroPanel row={m2Row("ht")} view={{ kind: "idle" }} {...h} />);
    await fireEvent.press(screen.getByLabelText("Empezar 25 min"));
    expect(h.onStart).toHaveBeenCalledWith(25);
  });
  it("running: shows the remaining time and offers to finish now (save the elapsed) or cancel", async () => {
    const h = handlers();
    await render(<PomodoroPanel row={m2Row("ht")} view={{ kind: "running", habitId: "ht", minutes: 25, remainingMs: 24 * MIN + 59_000 }} {...h} />);
    expect(screen.getByText("24:59")).toBeTruthy();
    await fireEvent.press(screen.getByText("Terminar ahora"));
    expect(h.onSave).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Cancelar"));
    expect(h.onCancel).toHaveBeenCalled();
  });
  it("finished (also when opened from the notification): offers to save the whole block", async () => {
    const h = handlers();
    await render(<PomodoroPanel row={m2Row("ht")} view={{ kind: "finished", habitId: "ht", minutes: 25 }} {...h} />);
    expect(screen.getByText("Terminó tu bloque de 25 min")).toBeTruthy();
    await fireEvent.press(screen.getByText("Guardar 25 min"));
    expect(h.onSave).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Descartar"));
    expect(h.onCancel).toHaveBeenCalled();
  });
  it("shows an error line and a missing habit", async () => {
    const h = handlers();
    const { rerender } = await render(<PomodoroPanel row={m2Row("ht")} view={{ kind: "idle" }} error="Ya hay un Pomodoro en marcha." {...h} />);
    expect(screen.getByText("Ya hay un Pomodoro en marcha.")).toBeTruthy();
    await rerender(<PomodoroPanel row={null} view={{ kind: "idle" }} {...h} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
  });
});
