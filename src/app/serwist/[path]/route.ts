import { createSerwistRoute } from '@serwist/turbopack'
import { PRECACHE_GLOBS } from '@/lib/sw-cache'

// Serves /serwist/sw.js: the bundled service worker built from src/app/sw.ts.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  globPatterns: PRECACHE_GLOBS,
  esbuildOptions: { target: "es2022" },
})
