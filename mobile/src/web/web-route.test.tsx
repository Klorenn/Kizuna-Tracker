import { render } from "@testing-library/react-native";
import Web from "../../app/(app)/web";

const mockWebScreen = jest.fn();
let mockParams: { path?: string } = {};
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));
jest.mock("./WebScreen", () => ({ WebScreen: (p: { path: string }) => { mockWebScreen(p.path); return null; } }));

describe("web route", () => {
  beforeEach(() => mockWebScreen.mockClear());
  it("opens the safe internal path it is given", async () => {
    mockParams = { path: "/retos/123" };
    await render(<Web />);
    expect(mockWebScreen).toHaveBeenCalledWith("/retos/123");
  });
  it("a missing or unsafe path opens the web home, never an arbitrary url", async () => {
    for (const path of [undefined, "https://evil.com", "//evil.com", "/a/../b"]) {
      mockParams = { path };
      mockWebScreen.mockClear();
      await render(<Web />);
      expect(mockWebScreen).toHaveBeenCalledWith("/");
    }
  });
});
