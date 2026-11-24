import { fireEvent, render, screen } from "@testing-library/react-native";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { selectToday, type TodayRaw } from "../data/today";
import { HoyView } from "./HoyView";
import { m2View, m3Raw } from "./test-fixtures";

const view = selectToday(fixture.raw as unknown as TodayRaw, new Date(fixture.nowIso));

describe("HoyView", () => {
  it("shows the label, the progress and every habit with its streak", async () => {
    await render(<HoyView state={{ kind: "ready", view }} onRetry={() => {}} />);
    expect(screen.getByText("Hoy · mié 25 nov")).toBeTruthy();
    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByText("Leer")).toBeTruthy();
    expect(screen.getByText("Gimnasio")).toBeTruthy();
    expect(screen.getByText("Meditar")).toBeTruthy();
    expect(screen.getByText("Racha 3")).toBeTruthy(); // Leer
    expect(screen.getByText("Racha 1")).toBeTruthy(); // Gimnasio, weekly
  });
  it("marks done habits and lists the checked items with their time", async () => {
    await render(<HoyView state={{ kind: "ready", view }} onRetry={() => {}} />);
    expect(screen.getAllByLabelText("Hecho")).toHaveLength(1);
    expect(screen.getAllByLabelText("Pendiente")).toHaveLength(1); // Meditar (steps)
    expect(screen.getByLabelText("Marcar Gimnasio")).toBeTruthy(); // the pending boolean habit is a tappable checkbox
    expect(screen.getByText("Respirar · 10:30")).toBeTruthy();
    expect(screen.getByText("Sentarse")).toBeTruthy();
  });
  it("shows an empty state when there are no habits", async () => {
    await render(<HoyView state={{ kind: "ready", view: { ...view, rows: [], total: 0, doneCount: 0, progress: 0 } }} onRetry={() => {}} />);
    expect(screen.getByText("Aún no tienes hábitos.")).toBeTruthy();
  });
  it("loading shows a spinner label; a failure shows a retry; offline says Sin conexión", async () => {
    const { rerender } = await render(<HoyView state={{ kind: "loading" }} onRetry={() => {}} />);
    expect(screen.getByText("Cargando…")).toBeTruthy();
    await rerender(<HoyView state={{ kind: "error", offline: false }} onRetry={() => {}} />);
    expect(screen.getByText("No se pudo cargar Hoy.")).toBeTruthy();
    expect(screen.getByText("Reintentar")).toBeTruthy();
    await rerender(<HoyView state={{ kind: "error", offline: true }} onRetry={() => {}} />);
    expect(screen.getByText("Sin conexión")).toBeTruthy();
  });
  it("the retry button calls onRetry", async () => {
    const onRetry = jest.fn();
    await render(<HoyView state={{ kind: "error", offline: false }} onRetry={onRetry} />);
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("HoyView actions", () => {
  const ready = { kind: "ready", view } as const;
  const actions = () => ({ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn(), onOpen: jest.fn() });

  it("tapping a pending boolean habit checks it", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    await fireEvent.press(screen.getByLabelText("Marcar Gimnasio"));
    expect(a.onCheck).toHaveBeenCalledWith(expect.objectContaining({ id: "h2" }));
  });
  it("a done boolean habit offers Deshacer, which undoes it", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    await fireEvent.press(screen.getByText("Deshacer"));
    expect(a.onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: "h1" }));
    expect(a.onCheck).not.toHaveBeenCalled();
  });
  it("steps are tappable: an unchecked one checks, a checked one unchecks", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    await fireEvent.press(screen.getByText("Sentarse"));
    expect(a.onItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: "h3" }), expect.objectContaining({ id: "i2", checked: false }));
    await fireEvent.press(screen.getByText("Respirar · 10:30"));
    expect(a.onItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: "h3" }), expect.objectContaining({ id: "i1", checked: true }));
  });
  it("a habit with steps has no single-tap check", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    expect(screen.queryByLabelText("Marcar Meditar")).toBeNull();
  });
  it("unsupported rows say they are registered on the web and open the detail on tap", async () => {
    const a = actions();
    const row = { ...view.rows[1], id: "q1", name: "Agua", logType: "none" as const, requiresPhoto: true };
    await render(<HoyView state={{ kind: "ready", view: { ...view, rows: [row] } }} onRetry={() => {}} actions={a} />);
    expect(screen.queryByLabelText("Marcar Agua")).toBeNull();
    expect(screen.getByText("Se registra desde la web")).toBeTruthy();
    await fireEvent.press(screen.getByText("Agua"));
    expect(a.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
  });
  it("shows the error banner and dismisses it on tap", async () => {
    const onDismissError = jest.fn();
    await render(<HoyView state={ready} onRetry={() => {}} actions={actions()} errorMessage="Este hábito pide una foto de prueba." onDismissError={onDismissError} />);
    await fireEvent.press(screen.getByText("Este hábito pide una foto de prueba."));
    expect(onDismissError).toHaveBeenCalled();
  });
});

describe("HoyView quantity and time rows", () => {
  const ready = { kind: "ready", view: m2View() } as const;
  const actions = () => ({ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn(), onOpen: jest.fn(), onQuantity: jest.fn(), onTime: jest.fn() });

  it("a quantity row shows its progress and adds one step with the quick button", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    expect(screen.getByText("750 de 2.000 ml")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Sumar 250 ml a Agua"));
    expect(a.onQuantity).toHaveBeenCalledWith(expect.objectContaining({ id: "hq" }), 250);
  });
  it("a time row shows today's time and opens the time screen", async () => {
    const a = actions();
    await render(<HoyView state={ready} onRetry={() => {}} actions={a} />);
    expect(screen.getByText("30 min · inglés")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Registrar tiempo de Estudio"));
    expect(a.onTime).toHaveBeenCalledWith(expect.objectContaining({ id: "ht" }));
  });
  it("quantity and time rows no longer say they are registered from the web", async () => {
    await render(<HoyView state={ready} onRetry={() => {}} actions={actions()} />);
    expect(screen.queryByText("Se registra desde la web")).toBeNull();
  });
});

describe("HoyView log rows (reading, workout, cardio, watch)", () => {
  const view3 = selectToday(m3Raw(), new Date(fixture.nowIso));
  const ready3 = { kind: "ready", view: view3 } as const;
  it("no longer says they are registered from the web; each has its own button", async () => {
    await render(<HoyView state={ready3} onRetry={() => {}} actions={{ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn(), onOpen: jest.fn(), onLog: jest.fn() }} />);
    expect(screen.queryByText("Se registra desde la web")).toBeNull();
    expect(screen.getByText("26 páginas · Dune")).toBeTruthy();
    expect(screen.getByLabelText("Registrar lectura de Lectura")).toBeTruthy();
    expect(screen.getByLabelText("Registrar entrenamiento de Gym")).toBeTruthy();
    expect(screen.getByLabelText("Registrar salida de Correr")).toBeTruthy();
    expect(screen.getByLabelText("Registrar lo que viste de Series")).toBeTruthy();
  });
  it("the button opens the log screen of its type", async () => {
    const onLog = jest.fn();
    await render(<HoyView state={ready3} onRetry={() => {}} actions={{ onCheck: jest.fn(), onUndo: jest.fn(), onItem: jest.fn(), onOpen: jest.fn(), onLog }} />);
    await fireEvent.press(screen.getByLabelText("Registrar entrenamiento de Gym"));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ id: "hw" }), "workout");
  });
});
