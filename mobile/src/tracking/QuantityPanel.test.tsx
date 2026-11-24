import { fireEvent, render, screen } from "@testing-library/react-native";
import { m2Row } from "../today/test-fixtures";
import { QuantityPanel } from "./QuantityPanel";

const props = () => ({ row: m2Row("hq"), onAdd: jest.fn(), onRemove: jest.fn(), onBack: jest.fn() });

describe("QuantityPanel", () => {
  it("shows the running total against the goal and each sum", async () => {
    await render(<QuantityPanel {...props()} />);
    expect(screen.getByText("750 de 2.000 ml")).toBeTruthy();
    expect(screen.getByLabelText("Quitar 500 ml")).toBeTruthy();
    expect(screen.getByLabelText("Quitar 250 ml")).toBeTruthy();
  });
  it("the quick button adds one step", async () => {
    const p = props();
    await render(<QuantityPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Sumar 250 ml"));
    expect(p.onAdd).toHaveBeenCalledWith(250);
  });
  it("a typed amount is parsed with the web rules and added", async () => {
    const p = props();
    await render(<QuantityPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Cantidad"), "1.250");
    await fireEvent.press(screen.getByText("Sumar"));
    expect(p.onAdd).toHaveBeenCalledWith(1250);
  });
  it("an invalid typed amount shows the web copy and sends nothing", async () => {
    const p = props();
    await render(<QuantityPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Cantidad"), "1,5");
    await fireEvent.press(screen.getByText("Sumar"));
    expect(screen.getByText("Usa números enteros, por ejemplo 1250.")).toBeTruthy();
    expect(p.onAdd).not.toHaveBeenCalled();
  });
  it("removes a sum by its id", async () => {
    const p = props();
    await render(<QuantityPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Quitar 500 ml"));
    expect(p.onRemove).toHaveBeenCalledWith("e1");
  });
  it("a missing habit says so", async () => {
    await render(<QuantityPanel {...props()} row={null} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
  });
});
