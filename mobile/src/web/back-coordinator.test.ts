import { backScript, createBackCoordinator } from "./back-coordinator";

function setup(over: { ask?: (id: number) => boolean } = {}) {
  const asked: number[] = [];
  const fallback = jest.fn();
  const c = createBackCoordinator({
    ask: over.ask ?? ((id) => (asked.push(id), true)),
    fallback,
    timeoutMs: 150,
  });
  return { c, asked, fallback };
}

describe("back coordinator", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("asks the page and swallows the press; handled by the page means no fallback", () => {
    const { c, asked, fallback } = setup();
    expect(c.press()).toBe(true);
    expect(asked).toHaveLength(1);
    c.reply({ id: asked[0], handled: true });
    jest.advanceTimersByTime(1000);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("not handled by the page: falls back at once", () => {
    const { c, asked, fallback } = setup();
    c.press();
    c.reply({ id: asked[0], handled: false });
    expect(fallback).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("no reply within 150 ms (old web, hung page): falls back once; a late reply is ignored", () => {
    const { c, asked, fallback } = setup();
    c.press();
    jest.advanceTimersByTime(149);
    expect(fallback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    c.reply({ id: asked[0], handled: false });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("a reply for another request id is ignored", () => {
    const { c, asked, fallback } = setup();
    c.press();
    c.reply({ id: asked[0] + 1, handled: false });
    expect(fallback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(150);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("a second press while one is in flight does not ask again", () => {
    const { c, asked } = setup();
    c.press();
    expect(c.press()).toBe(true);
    expect(asked).toHaveLength(1);
  });

  it("each press gets a fresh id", () => {
    const { c, asked } = setup();
    c.press();
    c.reply({ id: asked[0], handled: true });
    c.press();
    expect(asked[1]).not.toBe(asked[0]);
  });

  it("when the page cannot be asked (no WebView yet) the press is not handled", () => {
    const { c, fallback } = setup({ ask: () => false });
    expect(c.press()).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("dispose cancels the timer", () => {
    const { c, fallback } = setup();
    c.press();
    c.dispose();
    jest.advanceTimersByTime(1000);
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("backScript", () => {
  it("calls the page bridge with the id, answers handled: false itself when the page has none, and returns true", () => {
    const js = backScript(5);
    expect(js).toContain("window.__kizunaBack");
    expect(js).toContain("5");
    expect(js).toContain("kizuna.back");
    expect(js.trim().endsWith("true;")).toBe(true);
    expect(() => new Function(js)).not.toThrow();
  });
});
