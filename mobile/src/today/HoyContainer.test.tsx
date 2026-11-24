import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { clearTrackingError } from "../data/errors";
import { createQueryClient } from "../data/query-client";
import { reportTrackingError } from "../data/errors";
import type { TodayRaw } from "../data/today";
import { HoyContainer } from "./HoyContainer";
import { m2Raw } from "./test-fixtures";

jest.mock("@/lib/tracking-rpc");
jest.mock("../data/ids", () => ({ newClientId: () => "cid-1" }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => {} }));
import * as rpc from "@/lib/tracking-rpc";

const mocked = rpc as jest.Mocked<typeof rpc>;
const raw = fixture.raw as unknown as TodayRaw;

async function mount(data: TodayRaw = raw, onNavigate: (path: string) => void = () => {}) {
  const qc = createQueryClient({ client: () => ({}) as never, reportError: reportTrackingError });
  qc.setQueryData(["today", "u1"], data);
  await render(
    <QueryClientProvider client={qc}>
      <HoyContainer userId="u1" client={() => ({}) as never} onOpenHabit={() => {}} onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  jest.resetAllMocks();
  clearTrackingError();
});

describe("HoyContainer", () => {
  it("a tap is optimistic: the habit shows done and the count moves before the server answers", async () => {
    mocked.checkInRpc.mockReturnValue(new Promise(() => {}));
    const qc = await mount();
    expect(screen.getByText("1 de 3")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Marcar Gimnasio"));
    await waitFor(() => expect(screen.getByText("2 de 3")).toBeTruthy());
    expect(screen.queryByLabelText("Marcar Gimnasio")).toBeNull();
    qc.clear();
  });

  it("a server error rolls back and shows the web copy", async () => {
    mocked.checkInRpc.mockResolvedValue({ ok: false, error: "Este hábito pide una foto de prueba." });
    const qc = await mount();
    await fireEvent.press(screen.getByLabelText("Marcar Gimnasio"));
    await waitFor(() => expect(screen.getByText("Este hábito pide una foto de prueba.")).toBeTruthy());
    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByLabelText("Marcar Gimnasio")).toBeTruthy();
    qc.clear();
  });

  it("undo removes the check-in", async () => {
    mocked.undoCheckInRpc.mockReturnValue(new Promise(() => {}));
    const qc = await mount();
    await fireEvent.press(screen.getByText("Deshacer"));
    await waitFor(() => expect(screen.getByText("0 de 3")).toBeTruthy());
    expect(mocked.undoCheckInRpc).toHaveBeenCalledWith(expect.anything(), "u1", "h1");
    qc.clear();
  });

  it("checking the last step completes the day optimistically", async () => {
    mocked.checkItemRpc.mockReturnValue(new Promise(() => {}));
    const qc = await mount();
    await fireEvent.press(screen.getByText("Sentarse"));
    await waitFor(() => expect(screen.getByText("2 de 3")).toBeTruthy());
    qc.clear();
  });

  it("the quick add on a quantity row is optimistic and sends the step", async () => {
    mocked.addQuantityRpc.mockReturnValue(new Promise(() => {}));
    const qc = await mount(m2Raw());
    expect(screen.getByText("750 de 2.000 ml")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Sumar 250 ml a Agua"));
    await waitFor(() => expect(screen.getByText("1.000 de 2.000 ml")).toBeTruthy());
    expect(mocked.addQuantityRpc).toHaveBeenCalledWith(expect.anything(), "hq", "cid-1", 250);
    qc.clear();
  });

  it("Registrar on a time row opens the time screen", async () => {
    const onNavigate = jest.fn();
    const qc = await mount(m2Raw(), onNavigate);
    await fireEvent.press(screen.getByLabelText("Registrar tiempo de Estudio"));
    expect(onNavigate).toHaveBeenCalledWith("/registros/ht/time");
    qc.clear();
  });
});
