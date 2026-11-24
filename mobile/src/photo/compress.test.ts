import { MAX_PHOTO_BYTES, PHOTO_NOT_JPEG, PHOTO_TOO_BIG } from "@/lib/photo-copy";
import { prepareJpeg } from "./compress";

const MB = 1024 * 1024;
/** A fake codec: each manipulate call yields a file whose size follows `sizes` (one per attempt). */
const codec = (sizes: number[]) => {
  const calls: { width: number; quality: number }[] = [];
  const files = new Map<string, number>();
  return {
    calls,
    deps: {
      manipulate: jest.fn(async (_uri: string, o: { width: number; quality: number }) => {
        calls.push(o);
        const uri = `file:///out-${calls.length}.jpg`;
        files.set(uri, sizes[Math.min(calls.length - 1, sizes.length - 1)]);
        return { uri };
      }),
      fileSize: jest.fn(async (uri: string) => files.get(uri) ?? 0),
    },
  };
};

describe("prepareJpeg", () => {
  it("a photo that is already small is re-encoded once and kept", async () => {
    const c = codec([1 * MB]);
    expect(await prepareJpeg("file:///in.jpg", c.deps)).toEqual({ ok: true, uri: "file:///out-1.jpg", size: 1 * MB });
    expect(c.calls).toHaveLength(1);
  });
  it("a 6 MB photo is compressed further until it is at most 4 MB", async () => {
    const c = codec([6 * MB, 5 * MB, 3.5 * MB]);
    const r = await prepareJpeg("file:///big.jpg", c.deps);
    expect(r).toEqual({ ok: true, uri: "file:///out-3.jpg", size: 3.5 * MB });
    expect(r.ok && r.size <= MAX_PHOTO_BYTES).toBe(true);
    // every attempt is smaller than the one before (width or quality goes down)
    expect(c.calls[1].width <= c.calls[0].width && c.calls[1].quality <= c.calls[0].quality).toBe(true);
    expect(c.calls[2].width <= c.calls[1].width && c.calls[2].quality <= c.calls[1].quality).toBe(true);
  });
  it("exactly 4 MB is accepted; one byte more is not", async () => {
    expect((await prepareJpeg("f", codec([MAX_PHOTO_BYTES]).deps)).ok).toBe(true);
    expect((await prepareJpeg("f", codec([MAX_PHOTO_BYTES + 1]).deps)).ok).toBe(false);
  });
  it("still too big after every attempt: the web copy and no file to send", async () => {
    expect(await prepareJpeg("f", codec([9 * MB]).deps)).toEqual({ ok: false, error: PHOTO_TOO_BIG });
  });
  it("a file that is not an image gets the web copy", async () => {
    const deps = { manipulate: jest.fn(async () => { throw new Error("not an image"); }), fileSize: jest.fn() };
    expect(await prepareJpeg("file:///a.pdf", deps)).toEqual({ ok: false, error: PHOTO_NOT_JPEG });
    expect(deps.fileSize).not.toHaveBeenCalled();
  });
  it("a mime type that is not an image is refused before any work", async () => {
    const c = codec([1 * MB]);
    expect(await prepareJpeg("file:///a.pdf", c.deps, "application/pdf")).toEqual({ ok: false, error: PHOTO_NOT_JPEG });
    expect(c.deps.manipulate).not.toHaveBeenCalled();
    expect((await prepareJpeg("file:///a.jpg", c.deps, "image/jpeg")).ok).toBe(true);
  });
});
