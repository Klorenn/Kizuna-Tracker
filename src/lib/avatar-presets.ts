/** Eight bundled cat avatars: public/avatars/preset-1.webp ... preset-8.webp (256 px). */
export const AVATAR_PRESET_COUNT = 8;

export const AVATAR_PRESETS: readonly number[] = Array.from({ length: AVATAR_PRESET_COUNT }, (_, i) => i + 1);

/** True for the integers 1..8 (what the database column and the signup metadata accept). */
export function isAvatarPreset(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= AVATAR_PRESET_COUNT;
}

export function presetUrl(preset: number): string {
  return `/avatars/preset-${preset}.webp`;
}

/** Random preset for the signup form's first render. `random` is injectable for tests. */
export function pickRandomPreset(random: () => number = Math.random): number {
  return Math.min(AVATAR_PRESET_COUNT, Math.floor(random() * AVATAR_PRESET_COUNT) + 1);
}

export type AvatarSource = { kind: "photo"; src: string } | { kind: "preset"; src: string } | { kind: "initials" };

/**
 * Uploaded photo, then the preset image, then initials. A deleted account never shows either
 * image (initials only), even if a stale row still carries them.
 */
export function resolveAvatarSource(input: {
  photo?: string | null;
  preset?: number | null;
  deleted?: boolean;
}): AvatarSource {
  if (input.deleted) return { kind: "initials" };
  if (input.photo) return { kind: "photo", src: input.photo };
  if (isAvatarPreset(input.preset)) return { kind: "preset", src: presetUrl(input.preset) };
  return { kind: "initials" };
}
