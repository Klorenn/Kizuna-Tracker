import { fireEvent, render, screen } from "@testing-library/react-native";
import { m3Row } from "../today/test-fixtures";
import { PhotoPanel } from "./PhotoPanel";

const props = (over = {}) => ({
  row: m3Row("hr"),
  itemLabel: null as string | null,
  onTake: jest.fn(async () => ({ status: "sent" as const, dayCompleted: false, duplicate: false })),
  onBack: jest.fn(),
  ...over,
});

describe("PhotoPanel", () => {
  it("takes the photo and shows Foto enviada", async () => {
    const p = props();
    await render(<PhotoPanel {...p} />);
    expect(screen.getByText("Lectura")).toBeTruthy();
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(p.onTake).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Foto enviada")).toBeTruthy();
    expect(screen.queryByText("Tomar foto")).toBeNull();
  });
  it("says when the photo completed the day", async () => {
    await render(<PhotoPanel {...props({ onTake: jest.fn(async () => ({ status: "sent" as const, dayCompleted: true, duplicate: false })) })} />);
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(await screen.findByText("Foto enviada")).toBeTruthy();
    expect(screen.getByText("Completaste el día.")).toBeTruthy();
  });
  it("shows the error copy and lets the user retry", async () => {
    const take = jest.fn()
      .mockResolvedValueOnce({ status: "error", error: "La foto pesa demasiado. Prueba con otra o toma una nueva." })
      .mockResolvedValueOnce({ status: "sent", dayCompleted: false, duplicate: false });
    await render(<PhotoPanel {...props({ onTake: take })} />);
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(await screen.findByText("La foto pesa demasiado. Prueba con otra o toma una nueva.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(await screen.findByText("Foto enviada")).toBeTruthy();
    expect(screen.queryByText("La foto pesa demasiado. Prueba con otra o toma una nueva.")).toBeNull();
  });
  it("cancelling the camera leaves the screen as it was", async () => {
    await render(<PhotoPanel {...props({ onTake: jest.fn(async () => ({ status: "cancelled" as const })) })} />);
    await fireEvent.press(screen.getByText("Tomar foto"));
    expect(screen.getByText("Tomar foto")).toBeTruthy();
    expect(screen.queryByText("Foto enviada")).toBeNull();
  });
  it("a step photo names the step", async () => {
    await render(<PhotoPanel {...props({ itemLabel: "Sentarse" })} />);
    expect(screen.getByText("Sentarse")).toBeTruthy();
  });
  it("a second tap while sending does not start another upload", async () => {
    let finish: (v: { status: "sent"; dayCompleted: boolean; duplicate: boolean }) => void = () => {};
    const take = jest.fn(() => new Promise<{ status: "sent"; dayCompleted: boolean; duplicate: boolean }>((r) => { finish = r; }));
    await render(<PhotoPanel {...props({ onTake: take })} />);
    await fireEvent.press(screen.getByText("Tomar foto"));
    await fireEvent.press(screen.getByText("Enviando…"));
    expect(take).toHaveBeenCalledTimes(1);
    finish({ status: "sent", dayCompleted: false, duplicate: false });
    expect(await screen.findByText("Foto enviada")).toBeTruthy();
  });
  it("a missing habit says so", async () => {
    await render(<PhotoPanel {...props({ row: null })} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
  });
});
