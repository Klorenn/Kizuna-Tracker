import { createSerwistRoute } from '@serwist/turbopack'

// Serves /serwist/sw.js: the bundled service worker built from src/app/sw.ts.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  esbuildOptions: { target: "es2022" },
})
