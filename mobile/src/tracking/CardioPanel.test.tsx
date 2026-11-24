import { fireEvent, render, screen } from "@testing-library/react-native";
import { m3Row } from "../today/test-fixtures";
import { CardioPanel } from "./CardioPanel";

const ok = { ok: true } as const;
const outings = [{ id: "e1", kind: "run" as const, distanceM: 5000, durationS: 1800 }];
const props = (over = {}) => ({
  row: m3Row("hc"),
  outings,
  onSave: jest.fn(async () => ok),
  onUpdate: jest.fn(async () => ok),
  onDelete: jest.fn(async () => ok),
  onMark: jest.fn(async () => ok),
  onBack: jest.fn(),
  ...over,
});
const fill = async (km: string, m = "30") => {
  await fireEvent.changeText(screen.getByLabelText("Distancia"), km);
  await fireEvent.changeText(screen.getByLabelText("Minutos"), m);
};

describe("CardioPanel", () => {
  it("saves a run: kilometres become metres, minutes become seconds", async () => {
    const p = props();
    await render(<CardioPanel {...p} />);
    await fill("5,2");
    await fireEvent.press(screen.getByText("Guardar salida"));
    expect(p.onSave).toHaveBeenCalledWith({ kind: "run", distanceM: 5200, durationS: 1800, effort: null, note: null });
    expect(await screen.findByText("Guardado")).toBeTruthy();
  });
  it("swimming is typed in metres; effort and note go along", async () => {
    const p = props();
    await render(<CardioPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Actividad Natación"));
    await fill("1500", "40");
    await fireEvent.press(screen.getByLabelText("Esfuerzo 4"));
    await fireEvent.changeText(screen.getByLabelText("Nota"), " suave ");
    await fireEvent.press(screen.getByText("Guardar salida"));
    expect(p.onSave).toHaveBeenCalledWith({ kind: "swim", distanceM: 1500, durationS: 2400, effort: 4, note: "suave" });
  });
  it("shows the web copy for an empty or bad field and sends nothing", async () => {
    const p = props();
    await render(<CardioPanel {...p} />);
    await fireEvent.press(screen.getByText("Guardar salida"));
    expect(screen.getByText("Escribe la distancia.")).toBeTruthy();
    await fill("5", "0");
    await fireEvent.press(screen.getByText("Guardar salida"));
    expect(screen.getByText("Escribe el tiempo.")).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("lists the outings; one is edited and one deleted", async () => {
    const p = props();
    await render(<CardioPanel {...p} />);
    expect(screen.getByText("Trote · 5 km · 30 min")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Editar salida 1"));
    await fireEvent.changeText(screen.getByLabelText("Distancia"), "6");
    await fireEvent.press(screen.getByText("Actualizar salida"));
    expect(p.onUpdate).toHaveBeenCalledWith("e1", { kind: "run", distanceM: 6000, durationS: 1800, effort: null, note: null });
    await fireEvent.press(screen.getByLabelText("Quitar salida 1"));
    expect(p.onDelete).toHaveBeenCalledWith("e1");
  });
  it("a refusal is shown and Solo marcar works", async () => {
    const p = props({ onSave: jest.fn(async () => ({ ok: false as const, error: "Puedes registrar hasta 10 salidas por día." })) });
    await render(<CardioPanel {...p} />);
    await fill("5");
    await fireEvent.press(screen.getByText("Guardar salida"));
    expect(await screen.findByText("Puedes registrar hasta 10 salidas por día.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Solo marcar"));
    expect(p.onMark).toHaveBeenCalled();
  });
});
