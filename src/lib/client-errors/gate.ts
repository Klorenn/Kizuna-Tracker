/** Client-side dedup plus a cap per page load. A repeated key never uses up the cap. */
export function createGate(max: number): (key: string) => boolean {
  const seen = new Set<string>()
  return (key) => {
    if (seen.has(key) || seen.size >= max) return false
    seen.add(key)
    return true
  }
}
