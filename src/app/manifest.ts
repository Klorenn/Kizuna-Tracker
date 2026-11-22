import type { MetadataRoute } from 'next'

// Colors mirror --color-paper in src/styles/tokens.css (a manifest cannot read CSS variables).
const PAPER = '#FAFAFA'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kizuna Tracker',
    short_name: 'Kizuna',
    description: 'Rachas de hábitos con retos entre amigos.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'es',
    theme_color: PAPER,
    background_color: PAPER,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
