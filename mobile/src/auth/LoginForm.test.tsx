import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("submits the typed identifier and password", async () => {
    const onSubmit = jest.fn(async () => ({ ok: true as const }));
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByPlaceholderText("Correo o @usuario"), "@pau");
    await fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), "secret");
    await fireEvent.press(screen.getByText("Entrar"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("@pau", "secret"));
  });
  it("a wrong password shows the web's Spanish error", async () => {
    const onSubmit = jest.fn(async () => ({ ok: false as const, error: "Correo, usuario o contraseña incorrectos." }));
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByPlaceholderText("Correo o @usuario"), "a@b.co");
    await fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), "nope");
    await fireEvent.press(screen.getByText("Entrar"));
    expect(await screen.findByText("Correo, usuario o contraseña incorrectos.")).toBeTruthy();
  });
  it("offline shows Sin conexión, and a later success clears it", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Sin conexión" })
      .mockResolvedValueOnce({ ok: true });
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByPlaceholderText("Correo o @usuario"), "a@b.co");
    await fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), "pw");
    await fireEvent.press(screen.getByText("Entrar"));
    expect(await screen.findByText("Sin conexión")).toBeTruthy();
    await fireEvent.press(screen.getByText("Entrar"));
    await waitFor(() => expect(screen.queryByText("Sin conexión")).toBeNull());
  });
  it("does not submit with an empty field", async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText("Entrar"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("Crear cuenta opens the registration (the web /registro in the WebView)", async () => {
    const onCreateAccount = jest.fn();
    await render(<LoginForm onSubmit={jest.fn()} onCreateAccount={onCreateAccount} />);
    await fireEvent.press(screen.getByText("Crear cuenta"));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
  });
  it("has no Crear cuenta without a handler, and shows the notice it is given", async () => {
    const plain = await render(<LoginForm onSubmit={jest.fn()} />);
    expect(screen.queryByText("Crear cuenta")).toBeNull();
    plain.unmount();
    await render(<LoginForm onSubmit={jest.fn()} notice="Cuenta creada. Inicia sesión." />);
    expect(screen.getByText("Cuenta creada. Inicia sesión.")).toBeTruthy();
  });
});
