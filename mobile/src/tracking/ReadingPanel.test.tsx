import { fireEvent, render, screen } from "@testing-library/react-native";
import { m3Row } from "../today/test-fixtures";
import { ReadingPanel } from "./ReadingPanel";

const books = [
  { id: "b1", title: "Dune", totalPages: 400, nextFrom: 27 },
  { id: "b2", title: "Emma", totalPages: null, nextFrom: 1 },
];
const ok = { ok: true } as const;
const props = (over = {}) => ({
  row: m3Row("hr"),
  books,
  onSave: jest.fn(async () => ok),
  onMark: jest.fn(async () => ok),
  onDelete: jest.fn(async () => ok),
  onCreateBook: jest.fn(async () => ({ ok: true as const, id: "b9" })),
  onBack: jest.fn(),
  ...over,
});

describe("ReadingPanel", () => {
  it("lists the books and prefills the page to continue from", async () => {
    await render(<ReadingPanel {...props()} />);
    expect(screen.getByText("26 páginas · Dune")).toBeTruthy();
    expect(screen.getByLabelText("Libro Dune")).toBeTruthy();
    expect(screen.getByDisplayValue("27")).toBeTruthy();
  });
  it("saves the typed pages for the chosen book and shows Guardado", async () => {
    const p = props();
    await render(<ReadingPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Libro Emma"));
    await fireEvent.changeText(screen.getByLabelText("Hasta la página"), "30");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(p.onSave).toHaveBeenCalledWith({ bookId: "b2", fromPage: 1, toPage: 30, finished: false });
    expect(await screen.findByText("Guardado")).toBeTruthy();
  });
  it("marks the book as finished", async () => {
    const p = props();
    await render(<ReadingPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Hasta la página"), "400");
    await fireEvent.press(screen.getByLabelText("Terminé el libro"));
    await fireEvent.press(screen.getByText("Guardar"));
    expect(p.onSave).toHaveBeenCalledWith({ bookId: "b1", fromPage: 27, toPage: 400, finished: true });
  });
  it("bad pages show the web copy and nothing is sent", async () => {
    const p = props();
    await render(<ReadingPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Hasta la página"), "5");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(screen.getByText("La página final no puede ser menor que la inicial.")).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("a refusal from the server is shown as is", async () => {
    const p = props({ onSave: jest.fn(async () => ({ ok: false as const, error: "No encontramos ese libro." })) });
    await render(<ReadingPanel {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Hasta la página"), "40");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(await screen.findByText("No encontramos ese libro.")).toBeTruthy();
  });
  it("Solo marcar and Quitar lectura", async () => {
    const p = props();
    await render(<ReadingPanel {...p} />);
    await fireEvent.press(screen.getByText("Solo marcar"));
    expect(p.onMark).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Quitar lectura"));
    expect(p.onDelete).toHaveBeenCalled();
  });
  it("without a reading today there is nothing to remove", async () => {
    await render(<ReadingPanel {...props({ row: { ...m3Row("hr"), log: null } })} />);
    expect(screen.queryByText("Quitar lectura")).toBeNull();
  });
  it("creates a book and picks it", async () => {
    const p = props({ books: [] });
    await render(<ReadingPanel {...p} />);
    expect(screen.getByText("Agrega un libro para registrar lo que lees.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Título del libro"), "Dune");
    await fireEvent.changeText(screen.getByLabelText("Páginas totales"), "412");
    await fireEvent.press(screen.getByText("Agregar libro"));
    expect(p.onCreateBook).toHaveBeenCalledWith({ title: "Dune", author: null, totalPages: 412 });
  });
  it("a missing habit says so", async () => {
    await render(<ReadingPanel {...props({ row: null })} />);
    expect(screen.getByText("No encontramos ese hábito.")).toBeTruthy();
  });
});
