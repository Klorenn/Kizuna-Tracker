import { fireEvent, render, screen } from "@testing-library/react-native";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { selectToday, type TodayRaw } from "../data/today";
import { HabitDetail } from "./HabitDetail";
import { m2Row, m3Row } from "./test-fixtures";

const view = selectToday(fixture.raw as unknown as TodayRaw, new Date(fixture.nowIso));
const row = (id: string) => view.rows.find((r) => r.id === id)!;
const actions = () => ({ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn() });

describe("HabitDetail", () => {
  it("shows the streak and week, and checks a pending boolean habit", async () => {
    const a = actions();
    await render(<HabitDetail row={row("h2")} actions={a} onBack={() => {}} />);
    expect(screen.getByText("Racha 1 · Esta semana 1")).toBeTruthy();
    await fireEvent.press(screen.getByText("Marcar hecho"));
    expect(a.onCheck).toHaveBeenCalledWith(expect.objectContaining({ id: "h2" }));
  });
  it("undoes a done habit", async () => {
    const a = actions();
    await render(<HabitDetail row={row("h1")} actions={a} onBack={() => {}} />);
    await fireEvent.press(screen.getByText("Deshacer"));
    expect(a.onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: "h1" }));
  });
  it("toggles steps", async () => {
    const a = actions();
    await render(<HabitDetail row={row("h3")} actions={a} onBack={() => {}} />);
    await fireEvent.press(screen.getByText("Sentarse"));
    expect(a.onItem).toHaveBeenCalledWith(expect.objectContaining({ id: "h3" }), expect.objectContaining({ id: "i2" }));
  });
  it("a missing habit says so and goes back", async () => {
    const onBack = jest.fn();
    await render(<HabitDetail row={null} actions={actions()} onBack={onBack} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Volver"));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("HabitDetail quantity and time", () => {
  const nav = () => ({ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn(), onNavigate: jest.fn() });
  it("a quantity habit shows progress and opens the quantity screen", async () => {
    const a = nav();
    await render(<HabitDetail row={m2Row("hq")} actions={a} onBack={() => {}} />);
    expect(screen.getByText("750 de 2.000 ml")).toBeTruthy();
    await fireEvent.press(screen.getByText("Sumar cantidad"));
    expect(a.onNavigate).toHaveBeenCalledWith("/registros/hq/quantity");
  });
  it("a time habit opens the time screen and the pomodoro", async () => {
    const a = nav();
    await render(<HabitDetail row={m2Row("ht")} actions={a} onBack={() => {}} />);
    await fireEvent.press(screen.getByText("Registrar tiempo"));
    expect(a.onNavigate).toHaveBeenCalledWith("/registros/ht/time");
    await fireEvent.press(screen.getByText("Iniciar Pomodoro"));
    expect(a.onNavigate).toHaveBeenCalledWith("/registros/ht/pomodoro");
  });
});

describe("HabitDetail log habits", () => {
  it("a reading habit shows today's reading and opens its screen", async () => {
    const onNavigate = jest.fn();
    await render(<HabitDetail row={m3Row("hr")} actions={{ ...actions(), onNavigate }} onBack={() => {}} />);
    expect(screen.getByText("26 páginas · Dune")).toBeTruthy();
    expect(screen.queryByText("Se registra desde la web")).toBeNull();
    await fireEvent.press(screen.getByText("Registrar lectura"));
    expect(onNavigate).toHaveBeenCalledWith("/registros/hr/reading");
  });
  it.each([["hw", "Registrar entrenamiento", "workout"], ["hc", "Registrar salida", "cardio"], ["hv", "Registrar lo que viste", "watch"]])("%s opens %s", async (id, label, screen_) => {
    const onNavigate = jest.fn();
    await render(<HabitDetail row={m3Row(id)} actions={{ ...actions(), onNavigate }} onBack={() => {}} />);
    await fireEvent.press(screen.getByText(label));
    expect(onNavigate).toHaveBeenCalledWith(`/registros/${id}/${screen_}`);
  });
});

describe("HabitDetail photo", () => {
  it("a habit that needs a photo opens the camera screen", async () => {
    const onNavigate = jest.fn();
    const row = { ...m3Row("hv"), id: "p1", logType: "none" as const, requiresPhoto: true, done: false };
    await render(<HabitDetail row={row} actions={{ ...actions(), onNavigate }} onBack={() => {}} />);
    expect(screen.queryByText("Se registra desde la web")).toBeNull();
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(onNavigate).toHaveBeenCalledWith("/registros/p1/photo");
  });
});
