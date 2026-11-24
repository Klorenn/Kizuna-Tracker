/**
 * Leave a screen after a write that did NOT go through a server action (e.g. a route handler): the client router cache
 * (`staleTimes`) and prefetched tabs would keep showing the old data, so replace AND refresh. replace, not push: the
 * screen being left must not stay in the history.
 */
export function leaveAfterWrite(router: { replace: (href: string) => void; refresh: () => void }, href: string): void {
  router.replace(href);
  router.refresh();
}
