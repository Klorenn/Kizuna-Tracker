/**
 * Avatars show at 32 to 88 CSS px (XL at 3x = 264 px), so 256 px is plenty. The server still
 * re-validates and strips EXIF; this only keeps the upload and the friend lists light.
 */
export const AVATAR_COMPRESSION = {
  maxWidthOrHeight: 256,
  maxSizeMB: 0.1,
  fileType: "image/jpeg",
  useWebWorker: true,
} as const;
