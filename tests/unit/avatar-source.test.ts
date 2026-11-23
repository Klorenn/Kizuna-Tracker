import { describe, expect, it } from 'vitest'
import {
  AVATAR_PRESET_COUNT,
  isAvatarPreset,
  pickRandomPreset,
  presetUrl,
  resolveAvatarSource,
} from '@/lib/avatar-presets'

describe('isAvatarPreset', () => {
  it('accepts the integers 1..8 only', () => {
    for (let n = 1; n <= 8; n++) expect(isAvatarPreset(n)).toBe(true)
    for (const bad of [0, 9, -1, 2.5, NaN, Infinity, '3', null, undefined, {}]) {
      expect(isAvatarPreset(bad)).toBe(false)
    }
  })
})

describe('presetUrl', () => {
  it('points at the bundled webp', () => {
    expect(presetUrl(3)).toBe('/avatars/preset-3.webp')
    expect(AVATAR_PRESET_COUNT).toBe(8)
  })
})

describe('resolveAvatarSource', () => {
  const photo = 'https://x.test/storage/v1/object/public/avatars/u.jpg?v=1'

  it('prefers the uploaded photo over the preset', () => {
    expect(resolveAvatarSource({ photo, preset: 4 })).toEqual({ kind: 'photo', src: photo })
  })

  it('falls back to the preset image without a photo', () => {
    expect(resolveAvatarSource({ photo: null, preset: 4 })).toEqual({ kind: 'preset', src: '/avatars/preset-4.webp' })
    expect(resolveAvatarSource({ preset: 8 })).toEqual({ kind: 'preset', src: '/avatars/preset-8.webp' })
  })

  it('falls back to initials when the preset is missing or invalid', () => {
    expect(resolveAvatarSource({})).toEqual({ kind: 'initials' })
    expect(resolveAvatarSource({ photo: null, preset: null })).toEqual({ kind: 'initials' })
    expect(resolveAvatarSource({ preset: 0 })).toEqual({ kind: 'initials' })
    expect(resolveAvatarSource({ preset: 9 })).toEqual({ kind: 'initials' })
  })

  it('shows initials for deleted accounts whatever they carry', () => {
    expect(resolveAvatarSource({ photo, preset: 2, deleted: true })).toEqual({ kind: 'initials' })
  })
})

describe('pickRandomPreset', () => {
  it('maps a unit random to 1..8', () => {
    expect(pickRandomPreset(() => 0)).toBe(1)
    expect(pickRandomPreset(() => 0.999999)).toBe(8)
    expect(pickRandomPreset(() => 0.5)).toBe(5)
  })
  it('stays within range for the default generator', () => {
    for (let i = 0; i < 200; i++) expect(isAvatarPreset(pickRandomPreset())).toBe(true)
  })
})
