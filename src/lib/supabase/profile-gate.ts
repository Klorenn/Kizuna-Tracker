/** Sign the user out only when the profile query succeeded and found no row. */
export function shouldSignOut(res: { data: unknown | null; error: unknown | null }): boolean {
  return res.error == null && res.data == null
}
