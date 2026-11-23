# Groups area C report (group detail)

Worktree `/Users/paukoh/KL0REN PROJECTS/konjo/.claude/worktrees/agent-a0bfd3d79cd70457a`, branch `worktree-agent-a0bfd3d79cd70457a`, based on b0a7596.
First commit is the contract, copied with `cp` (`7238297 feat(groups): shared contract types`).

## Exported components (all under `src/components/groups/`)

| Component | Props | States covered |
|---|---|---|
| `detail/GroupDetailView` | `detail, board, wall, history, myUserId, actions: Pick<GroupActions, update/setCommitment/archive/createInvite/leave/removeMember/setAdmin/loadMoreWall/loadWeek>, onLeft`, plus optional `today?: string` | header (icon, colour, name, description, commitment, pending commitment, streak, "Cumplen N de M esta semana"), archived, each of the three reads failed independently, three sections kept mounted (hidden) so each keeps state, local overlay of accepted changes |
| `detail/BoardList` | `rows \| null, myUserId, color, retryHref` | failed (LoadFailed), rows by progress then name, "Tú", "Cumplió", "Empieza el lunes", progress segments in the group colour; `BoardRow` is `memo` |
| `detail/HistoryList` | `weeks \| null, groupId, actions: Pick<..., "loadWeek">, retryHref, color` | failed, empty ("Aún no hay semanas cerradas."), weeks with "Cumplieron N de M" and the caller's result (Cumpliste / No cumpliste / Aún no estabas); week sheet: loading, error + "Reintentar", rows (`WeekRowsView`, `loadWeekState`) |
| `detail/WallFeed` | `groupId, wall \| null, today?, actions: Pick<..., "loadMoreWall">, retryHref, color` | failed, empty, day groups (shared `groupByDay`/`feedDayLabel`), photo card (lazy, signed URL via `useSignedUrls`, loading frame, "Foto no disponible"), text row, "Ver más" (pending, error with "Reintentar", de-dup by `checkinId`), `WallChunk` is `memo` per page |
| `detail/MembersList` | `detail, members \| null, myUserId, actions: Pick<... 7 actions>, retryHref, onLeft, onEdited, onCommitmentSet, onArchived, onMemberRemoved, onRoleChanged` | rows with role, failed read, admin vs member vs archived (read-only, no buttons), invite sheet, per-member sheet (role toggle, remove with confirmation), edit group, change commitment, archive confirm, leave confirm, server errors inside the sheet, pending + single-flight on each action |
| `detail/AdminSheets` | bodies: `InviteView, EditGroupForm, CommitmentForm, ConfirmBody, MemberMenuBody` | each state of each body (pending, ready, copied, clipboard unavailable, error, validation) |
| `detail/group-logic.ts` | pure helpers | sort, compliance, wall paging, `copyLink`, `createRunner` (single-flight), validation, labels, overlay |
| `GroupChip` | `{ name, color }` | one line, truncates, `role="img"` + `aria-label="Grupo <nombre>"`, unknown colour falls back to default |

## Tests (7 new files, 105 tests, existing tests untouched)
`tests/unit/group-detail-logic.test.ts` (13), `group-board.test.ts` (11, includes GroupChip), `group-history.test.ts` (11), `group-wall.test.ts` (14), `group-admin-sheets.test.ts` (23), `group-members.test.ts` (16), `group-detail-view.test.ts` (17).

Each file was first run against a missing module.
RED (every file): `Error: Cannot find package '@/components/groups/detail/<Module>' ... Test Files 1 failed (1) / Tests no tests`.
GREEN: logic `Tests 13 passed (13)`; board `11 passed (11)`; history `11 passed (11)`; wall `14 passed (14)`; admin sheets `23 passed (23)`; members `16 passed (16)`; detail view `17 passed (17)`.
Assertion-level REDs hit on the way, all test-side mistakes fixed in the tests: board 360 px check tripped on the existing Avatar's `text-[12px]` (now asserts it is the only arbitrary size); admin sheets `readonly` vs React's `readOnly=""`, and a `pendingLabel` default.
Gates: `pnpm test` 166 files, 2120 tests passed; `pnpm typecheck` clean; `pnpm lint` clean (0 warnings).

## Copy written beyond the binding list
"Esta semana" (board label); "Aún no hay semanas cerradas."; "Cumpliste", "No cumpliste", "Aún no estabas"; "Subió su foto", "Registró"; "Cuando alguien registre, lo verás aquí."; "Foto no disponible"; "Este grupo está archivado."; "Administración", "Tu participación"; "Miembro"; "Opciones de <nombre>"; "Invitar al grupo", "Creando enlace…", "Cualquiera con este enlace puede unirse al grupo mientras haya lugar. Vence en 7 días.", "Enlace de invitación", "No pudimos copiar el enlace. Selecciónalo y cópialo a mano."; "¿Sacar a <nombre> del grupo? Su hábito sigue siendo suyo."; "Se aplica desde el próximo lunes. Hasta entonces sigue valiendo el compromiso actual."; "Una vez menos/más por semana"; "Guardar", "Guardando…", "Cancelar", "Archivando…", "Saliendo…", "Sacando…"; validation: "La descripción puede tener hasta 140 caracteres.", "El compromiso puede tener hasta 40 caracteres."; "Cargando…".

## Contract / area-document gaps (contract file untouched)
1. `GroupDetail` has no group time zone and the view props have no `today`: "Hoy/Ayer" labels need the viewer's date. I added an OPTIONAL `today` prop; without it the device date is used after mount (before mount nothing reads "Hoy").
2. There is no members read: Miembros is built from `board` (the only read with roles). If the board read fails, the members list shows `LoadFailed` (actions stay available).
3. Views have no "refresh" callback. Accepted changes (edit, commitment, archive, removal, role) are shown through a local overlay that a new `detail`/`board` prop replaces. The integration should still revalidate the page (e.g. `revalidatePath` in the actions, or `router.refresh()` in wrapped actions).
4. `WallItem` has no habit name or streak, so cards say "Subió su foto" / "Registró" and the alt is "Foto de <nombre>".
5. `update` fields include `icon`/`color` but `GroupDetail.color` etc. are plain strings: unknown icon keys render the people icon, unknown colours the default.
6. Validation limits (name 3-40, description 140, commitment 40, target 1-7) are duplicated locally in `group-logic.ts` (area A's `src/domain/groups.ts` must not be imported by a view); server stays the authority.
7. Area-doc: "Cumplen N de M" in the header is computed from the board (counted rows only); no value in the contract carries it.

## Integration notes
- Render `<GroupDetailView ... />` from a client wrapper that passes the server actions (a plain object of the nine actions) and `onLeft` = `router.replace("/grupos")` plus refresh. Pass `today` (the viewer's local date) from the server to avoid the post-mount label flip.
- `useSignedUrls` (browser Supabase client) is the only non-contract import; the wall's photos need the existing `proofs` storage policy branch from the database step.
- Reuses shared `ColorPicker` (fixed id `habit-color-label`, one per page) and `IconPicker`.
- `GroupChip` is server-safe: `<GroupChip name color />` inside the habit row's subtitle line (`HabitRow` not edited).
- Admin sheets are the only portals; they render only when open (never in static markup), so their bodies are exported and tested directly.
- No browser verification was done (no dev server by instruction): 360 px overflow, AA under each theme and the Sheet focus behaviour are checked by class/markup assertions only.

## Fix round 1
- I2: `MembersList.tsx` now has `inviteDecision` and `openInvite`; `invite` state starts `null`, lives while the view is mounted, and `createLink` only calls the action on first open or after an error (reopen reuses the URL; double tap = one call). Tests in `group-members.test.ts` (RED: `inviteDecision is not a function`, `openInvite is not a function`; GREEN).
- M2: `WallFeed.tsx` `useToday` returns `null` until known (prop, else device after mount; the device clock is never read when the prop is given); `group-logic.ts` `plainDayLabel` gives plain dates meanwhile. Tests in `group-wall.test.ts` (RED: "Hoy" present for 31 Dec; GREEN; 31 Dec with today 1 Jan = "Ayer").
- Gates: 166 files, 2125 tests; typecheck and lint clean. I1 left as ruled.
