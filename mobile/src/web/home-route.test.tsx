import { render } from "@testing-library/react-native";
import Home from "../../app/(app)/index";

const mockWebScreen = jest.fn();
let mockParams: { path?: string; n?: string } = {};
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));
jest.mock("./WebScreen", () => ({ WebScreen: (p: { path: string }) => { mockWebScreen(p.path); return null; } }));

describe("home route: the whole web app in one WebView", () => {
  beforeEach(() => mockWebScreen.mockClear());
  it("opens the web home by default", async () => {
    mockParams = {};
    await render(<Home />);
    expect(mockWebScreen).toHaveBeenCalledWith("/");
  });
  it("opens the safe internal path a push or a deep link asked for", async () => {
    mockParams = { path: "/retos/123?x=1", n: "9" };
    await render(<Home />);
    expect(mockWebScreen).toHaveBeenCalledWith("/retos/123?x=1");
  });
  it("an unsafe path opens the web home, never an arbitrary url", async () => {
    for (const path of ["https://evil.com", "//evil.com", "/a/../b"]) {
      mockParams = { path };
      mockWebScreen.mockClear();
      await render(<Home />);
      expect(mockWebScreen).toHaveBeenCalledWith("/");
    }
  });
});
