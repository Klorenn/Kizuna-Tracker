import { MAX_PHOTO_BYTES, PHOTO_NOT_JPEG, PHOTO_TOO_BIG } from "@/lib/photo-copy";

/** Each attempt is smaller than the last: the first keeps most of the detail, the last still reads as a proof photo. */
const LADDER = [
  { width: 2048, quality: 0.85 },
  { width: 1600, quality: 0.75 },
  { width: 1280, quality: 0.65 },
  { width: 1024, quality: 0.55 },
  { width: 800, quality: 0.45 },
] as const;

export type CompressDeps = {
  /** re-encodes as JPEG, no wider than `width`, at `quality` (0 to 1); throws when the file is not an image */
  manipulate: (uri: string, o: { width: number; quality: number }) => Promise<{ uri: string }>;
  fileSize: (uri: string) => Promise<number>;
};
export type Prepared = { ok: true; uri: string; size: number } | { ok: false; error: string };

/**
 * The JPEG to upload: re-encoded (so a camera or gallery format becomes JPEG, as the route requires) and shrunk step by
 * step until it is at most 4 MB (the server limit). A photo that never gets there is refused here: no request is made.
 */
export async function prepareJpeg(uri: string, deps: CompressDeps, mimeType?: string): Promise<Prepared> {
  if (mimeType !== undefined && !mimeType.startsWith("image/")) return { ok: false, error: PHOTO_NOT_JPEG };
  let last = 0;
  for (const step of LADDER) {
    let out: { uri: string };
    try {
      out = await deps.manipulate(uri, step);
    } catch {
      return { ok: false, error: PHOTO_NOT_JPEG };
    }
    last = await deps.fileSize(out.uri);
    if (last > 0 && last <= MAX_PHOTO_BYTES) return { ok: true, uri: out.uri, size: last };
  }
  return { ok: false, error: PHOTO_TOO_BIG };
}
