import { fireEvent, render, screen } from "@testing-library/react-native";
import { m3Row } from "../today/test-fixtures";
import { WatchPanel } from "./WatchPanel";

const ok = { ok: true } as const;
const media = [
  { id: "m1", title: "Dark", kind: "series" as const, totalSeasons: 3, totalEpisodes: 26, runtimeMin: null, status: "watching" as const, finishedOn: null },
  { id: "m2", title: "Alien", kind: "movie" as const, totalSeasons: null, totalEpisodes: null, runtimeMin: 117, status: "watching" as const, finishedOn: null },
];
const props = (over = {}) => ({
  row: m3Row("hv"),
  media,
  onSave: jest.fn(async () => ok),
  onMark: jest.fn(async () => ok),
  onDelete: jest.fn(async () => ok),
  onCreateMedia: jest.fn(async () => ({ ok: true as const, id: "m9" })),
  onBack: jest.fn(),
  ...over,
});

describe("WatchPanel", () => {
  it("a series entry sends episodes and the season", async () => {
    const p = props();
    await render(<WatchPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Título Dark"));
    await fireEvent.changeText(screen.getByLabelText("Episodios"), "2");
    await fireEvent.changeText(screen.getByLabelText("Temporada"), "1");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(p.onSave).toHaveBeenCalledWith({ mediaId: "m1", episodes: 2, season: 1, episodeTo: null, minutes: null, completed: false, finished: false });
    expect(await screen.findByText("Guardado")).toBeTruthy();
  });
  it("a movie takes minutes or Completa, and can be finished", async () => {
    const p = props();
    await render(<WatchPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Título Alien"));
    await fireEvent.press(screen.getByLabelText("La vi completa"));
    await fireEvent.press(screen.getByLabelText("Terminé el título"));
    await fireEvent.press(screen.getByText("Guardar"));
    expect(p.onSave).toHaveBeenCalledWith({ mediaId: "m2", episodes: null, season: null, episodeTo: null, minutes: null, completed: true, finished: true });
  });
  it("a movie with nothing says what it needs, and nothing is sent", async () => {
    const p = props();
    await render(<WatchPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Título Alien"));
    await fireEvent.press(screen.getByText("Guardar"));
    expect(screen.getByText("Indica los minutos o marca que la viste completa.")).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("creates a series and picks it", async () => {
    const p = props({ media: [] });
    await render(<WatchPanel {...p} />);
    expect(screen.getByText("Agrega un título para registrar lo que ves.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Título nuevo"), "Dark");
    await fireEvent.press(screen.getByText("Agregar título"));
    expect(p.onCreateMedia).toHaveBeenCalledWith({ title: "Dark", kind: "series", totalSeasons: null, totalEpisodes: null, runtimeMin: null });
  });
  it("a refusal is shown; Solo marcar and Quitar", async () => {
    const p = props({ row: { ...m3Row("hv"), log: { kind: "watch", title: "Dark", mediaKind: "series", episodes: 2, minutes: null, completed: false } }, onSave: jest.fn(async () => ({ ok: false as const, error: "No encontramos ese título." })) });
    await render(<WatchPanel {...p} />);
    await fireEvent.press(screen.getByLabelText("Título Dark"));
    await fireEvent.changeText(screen.getByLabelText("Episodios"), "1");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(await screen.findByText("No encontramos ese título.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Solo marcar"));
    expect(p.onMark).toHaveBeenCalled();
    await fireEvent.press(screen.getByText("Quitar lo visto"));
    expect(p.onDelete).toHaveBeenCalled();
  });
});
