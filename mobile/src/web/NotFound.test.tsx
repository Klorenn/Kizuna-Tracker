import { render } from "@testing-library/react-native";
import NotFound from "../../app/+not-found";

const mockRedirect = jest.fn();
let mockPath = "/retos/123";
jest.mock("expo-router", () => ({
  Redirect: (p: { href: string }) => { mockRedirect(p.href); return null; },
  usePathname: () => mockPath,
}));

describe("+not-found", () => {
  beforeEach(() => mockRedirect.mockClear());
  it("a web path the app has no screen for opens in the WebView", async () => {
    mockPath = "/retos/123";
    await render(<NotFound />);
    expect(mockRedirect).toHaveBeenCalledWith("/web?path=%2Fretos%2F123");
  });
  it("an unsafe path goes home instead", async () => {
    mockPath = "/a/../b";
    await render(<NotFound />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
