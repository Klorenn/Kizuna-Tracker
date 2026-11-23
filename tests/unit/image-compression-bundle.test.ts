import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AVATAR_COMPRESSION } from '@/components/profile/avatar-compression'

const src = (p: string) => readFileSync(p, 'utf8')

describe('browser-image-compression stays out of the initial bundle', () => {
  it.each(['src/components/PhotoReview.tsx', 'src/components/profile/useAvatarUpload.tsx'])(
    '%s loads it on demand, not with a static import',
    (p) => {
      const s = src(p)
      expect(s).not.toMatch(/^import .* from ["']browser-image-compression["']/m)
      expect(s).toMatch(/await import\(["']browser-image-compression["']\)/)
    },
  )
})

describe('avatar compression', () => {
  it('stays small: 256 px covers the 88 px XL avatar at 3x, 100 kB cap', () => {
    expect(AVATAR_COMPRESSION.maxWidthOrHeight).toBe(256)
    expect(AVATAR_COMPRESSION.maxSizeMB).toBe(0.1)
    expect(AVATAR_COMPRESSION.fileType).toBe('image/jpeg')
  })
})
