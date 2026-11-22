/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker'
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'

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
  runtimeCaching: defaultCache,
}).addEventListeners()

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
  const url = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/', self.location.origin).href
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
