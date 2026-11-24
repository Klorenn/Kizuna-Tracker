import { fireEvent, render, screen } from "@testing-library/react-native";
import { PushBanner } from "./PushBanner";

describe("PushBanner", () => {
  it("offers to turn notifications on while the prompt can still be shown", async () => {
    const onEnable = jest.fn();
    await render(<PushBanner state="ask" onEnable={onEnable} onOpenSettings={jest.fn()} />);
    expect(screen.getByText("Activa las notificaciones")).toBeTruthy();
    await fireEvent.press(screen.getByText("Activar"));
    expect(onEnable).toHaveBeenCalledTimes(1);
  });
  it("after a denial it points to the system settings instead of asking again", async () => {
    const onEnable = jest.fn();
    const onOpenSettings = jest.fn();
    await render(<PushBanner state="blocked" onEnable={onEnable} onOpenSettings={onOpenSettings} />);
    expect(screen.getByText(/ajustes del sistema/)).toBeTruthy();
    expect(screen.queryByText("Activar")).toBeNull();
    await fireEvent.press(screen.getByText("Abrir ajustes"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onEnable).not.toHaveBeenCalled();
  });
  it("renders nothing when granted or still unknown", async () => {
    const granted = await render(<PushBanner state="granted" onEnable={jest.fn()} onOpenSettings={jest.fn()} />);
    expect(granted.toJSON()).toBeNull();
    const unknown = await render(<PushBanner state="unknown" onEnable={jest.fn()} onOpenSettings={jest.fn()} />);
    expect(unknown.toJSON()).toBeNull();
  });
});
