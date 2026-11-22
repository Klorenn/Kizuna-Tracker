const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from the IHDR chunk of a PNG. Throws when the bytes are not a PNG. */
export function pngSize(buf: Uint8Array): { width: number; height: number } {
  if (buf.length < 24 || SIGNATURE.some((b, i) => buf[i] !== b)) throw new Error('not a PNG')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
