import { fireEvent, render, screen } from "@testing-library/react-native";
import { m3Row } from "../today/test-fixtures";
import { WorkoutPanel } from "./WorkoutPanel";

const ok = { ok: true } as const;
const exercises = [
  { id: "x1", name: "Sentadilla", group: "legs" as const },
  { id: "x2", name: "Press banca", group: "chest" as const },
];
const props = (over = {}) => ({
  row: m3Row("hw"),
  exercises,
  onSave: jest.fn(async () => ok),
  onDelete: jest.fn(async () => ok),
  onCreateExercise: jest.fn(async () => ({ ok: true as const, id: "x9" })),
  onBack: jest.fn(),
  ...over,
});
const addSquat = async () => {
  await fireEvent.press(screen.getByLabelText("Tipo de día Pierna"));
  await fireEvent.changeText(screen.getByLabelText("Buscar ejercicio"), "sent");
  await fireEvent.press(screen.getByLabelText("Agregar Sentadilla"));
};

describe("WorkoutPanel", () => {
  it("saves day types, the exercise and its sets", async () => {
    const p = props();
    await render(<WorkoutPanel {...p} />);
    await addSquat();
    await fireEvent.changeText(screen.getByLabelText("Repeticiones serie 1 de Sentadilla"), "8");
    await fireEvent.changeText(screen.getByLabelText("Peso serie 1 de Sentadilla"), "60,5");
    await fireEvent.press(screen.getByLabelText("Agregar serie a Sentadilla"));
    await fireEvent.changeText(screen.getByLabelText("Repeticiones serie 2 de Sentadilla"), "6");
    await fireEvent.changeText(screen.getByLabelText("Peso serie 2 de Sentadilla"), "65");
    await fireEvent.press(screen.getByText("Guardar entrenamiento"));
    expect(p.onSave).toHaveBeenCalledWith({ dayTypes: ["legs"], exercises: [{ exerciseId: "x1", sets: [{ reps: 8, kg: 60.5 }, { reps: 6, kg: 65 }] }] });
    expect(await screen.findByText("Guardado")).toBeTruthy();
  });
  it("without a day type the web copy shows and nothing is sent", async () => {
    const p = props();
    await render(<WorkoutPanel {...p} />);
    await fireEvent.press(screen.getByText("Guardar entrenamiento"));
    expect(screen.getByText("Elige al menos un tipo de día.")).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("a set with bad numbers is refused with the web copy", async () => {
    const p = props();
    await render(<WorkoutPanel {...p} />);
    await addSquat();
    await fireEvent.changeText(screen.getByLabelText("Repeticiones serie 1 de Sentadilla"), "0");
    await fireEvent.changeText(screen.getByLabelText("Peso serie 1 de Sentadilla"), "50");
    await fireEvent.press(screen.getByText("Guardar entrenamiento"));
    expect(screen.getByText("Las repeticiones van de 1 a 1000.")).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("removes an exercise and Quitar entrenamiento deletes", async () => {
    const p = props({ row: { ...m3Row("hw"), log: { kind: "workout", dayTypes: ["legs"], exerciseCount: 1 } } });
    await render(<WorkoutPanel {...p} />);
    expect(screen.getByText("Pierna · 1 ejercicio")).toBeTruthy();
    await addSquat();
    await fireEvent.press(screen.getByLabelText("Quitar Sentadilla"));
    expect(screen.queryByLabelText("Repeticiones serie 1 de Sentadilla")).toBeNull();
    await fireEvent.press(screen.getByText("Quitar entrenamiento"));
    expect(p.onDelete).toHaveBeenCalled();
  });
  it("creates an exercise in a muscle group and adds it", async () => {
    const p = props();
    await render(<WorkoutPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Buscar ejercicio"), "Remo");
    await fireEvent.press(screen.getByLabelText("Grupo Espalda"));
    await fireEvent.press(screen.getByText("Crear ejercicio"));
    expect(p.onCreateExercise).toHaveBeenCalledWith({ name: "Remo", group: "back" });
  });
  it("a server refusal is shown", async () => {
    const p = props({ onSave: jest.fn(async () => ({ ok: false as const, error: "Revisa las series del entrenamiento." })) });
    await render(<WorkoutPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Tipo de día Pierna"));
    await fireEvent.press(screen.getByText("Guardar entrenamiento"));
    expect(await screen.findByText("Revisa las series del entrenamiento.")).toBeTruthy();
  });
});
