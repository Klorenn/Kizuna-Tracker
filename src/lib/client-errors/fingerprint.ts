import { createHash } from 'node:crypto'

/** The first stack frame, with line:column removed so a rebuild that shifts lines keeps the same group. Server side only. */
export function firstFrame(stack: string | null | undefined): string {
  if (!stack) return ''
  for (const raw of stack.split('\n')) {
    const line = raw.trim()
    if (/^at\s/.test(line) || /^[^\s:]*@\S/.test(line)) return line.replace(/(?::\d+){1,2}(?=\)?$)/, '').slice(0, 200)
  }
  return ''
}

/** Grouping key: sha256(kind, message, first frame), 32 hex chars. */
export function fingerprint(e: { kind: string; message: string; stack: string | null }): string {
  return createHash('sha256').update(`${e.kind}\n${e.message}\n${firstFrame(e.stack)}`).digest('hex').slice(0, 32)
}
