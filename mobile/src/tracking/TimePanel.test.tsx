import { fireEvent, render, screen } from "@testing-library/react-native";
import { m2Row } from "../today/test-fixtures";
import { TimePanel } from "./TimePanel";

const props = () => ({ row: m2Row("ht"), onAdd: jest.fn(), onSet: jest.fn(), onDelete: jest.fn(), onPomodoro: jest.fn(), onBack: jest.fn() });

describe("TimePanel", () => {
  it("shows today's time and topic", async () => {
    await render(<TimePanel {...props()} />);
    expect(screen.getByText("30 min · inglés")).toBeTruthy();
  });
  it("a chip adds its minutes", async () => {
    const p = props();
    await render(<TimePanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Sumar 25 min"));
    expect(p.onAdd).toHaveBeenCalledWith(25, null);
  });
  it("typed minutes and topic are added; invalid minutes show the web copy", async () => {
    const p = props();
    await render(<TimePanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Minutos"), "40");
    await fireEvent.changeText(screen.getByLabelText("Tema"), "lectura");
    await fireEvent.press(screen.getByText("Sumar"));
    expect(p.onAdd).toHaveBeenCalledWith(40, "lectura");
    await fireEvent.changeText(screen.getByLabelText("Minutos"), "0");
    await fireEvent.press(screen.getByText("Sumar"));
    expect(screen.getByText("El tiempo va de 1 minuto a 24 horas.")).toBeTruthy();
    expect(p.onAdd).toHaveBeenCalledTimes(1);
  });
  it("sets the total, deletes it, and opens the pomodoro", async () => {
    const p = props();
    await render(<TimePanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Minutos"), "50");
    await fireEvent.press(screen.getByText("Fijar total"));
    expect(p.onSet).toHaveBeenCalledWith(50, null);
    await fireEvent.press(screen.getByText("Quitar tiempo"));
    expect(p.onDelete).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Iniciar Pomodoro"));
    expect(p.onPomodoro).toHaveBeenCalled();
  });
});
