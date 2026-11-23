/** PostgREST `or()` filter matching the friendship row between two people, whoever asked whom. */
export function friendshipPairFilter(a: string, b: string): string {
  return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;
}
