const PATH = /^\/registros\/[A-Za-z0-9-]+\/pomodoro$/;

/** The screen a Pomodoro-end notification opens, from its `data`; null for anything that is not that exact path. */
export function pomodoroPathOf(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === "string" && PATH.test(url) ? url : null;
}
