import { fireEvent, render, screen } from "@testing-library/react-native";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { selectToday, type TodayRaw } from "../data/today";
import { HoyView } from "./HoyView";

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
    expect(screen.getAllByLabelText("Pendiente")).toHaveLength(2);
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
    require("@testing-library/react-native").fireEvent.press(screen.getByText("Reintentar"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
