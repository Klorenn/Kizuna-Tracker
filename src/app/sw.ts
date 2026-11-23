/// <reference lib="webworker" />
import { CacheFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'
import { isStaticAsset, STATIC_CACHE_NAME } from '../lib/sw-cache'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // the query is part of the cache key: /brand/x.gif?v=2 is a different entry from ?v=1
    { matcher: isStaticAsset, handler: new CacheFirst({ cacheName: STATIC_CACHE_NAME, matchOptions: { ignoreSearch: false } }) },
    // pages, RSC, /api, Supabase: never cached
    { matcher: () => true, handler: new NetworkOnly() },
  ],
}).addEventListeners()

// Sign-out: drop every runtime cache (the precache is public app shell and stays).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type !== 'CLEAR_CACHES') return
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => !n.includes('precache')).map((n) => caches.delete(n)))),
  )
})

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    // ignore malformed payloads, show the generic notification
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Kizuna', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/', self.location.origin)
  const url = (target.origin === self.location.origin ? target : new URL('/', self.location.origin)).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus()
          if ('navigate' in w) await w.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
