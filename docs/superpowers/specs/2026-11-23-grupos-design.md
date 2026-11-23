# Grupos — design

Date: 2026-11-23. Status: draft for the owner's approval. Builds on `2026-11-22-konjo-design.md` (same rules: the app never moves money; the words "apuesta", "bet" and "pozo" are never used; clients never write check-ins or log tables; a failed read is an error state).

## Intent and why

Owner: "quiero que agregues una función que hace de que puedas crear grupos… somos 20, 30 personas, no sé, por grupo de gym. Y en estos grupos como que todos tienen que ir subiendo su progreso… en vez de hacerlo uno de uno, puedes hacerlo a la vez grupal." Then: "Con progreso y se puede definir multa igual como grupo y tienen que aceptar todos, mínimo la mitad del grupo" and, on where fines go, "Al fondo del grupo y igual se puede definir".

Today accountability is 1-on-1 (a challenge between two friends). A gym crew wants one shared commitment where everybody sees who is keeping up. The group is the unit; friendship between every pair is not required.

## Goals, non-goals, anti-goals

- Goals: create a group, join by link, one common weekly commitment, each member checks in on their own habit, a board of the week, a wall of check-ins, a group streak, and an optional fine owed to the group's fund once at least half of the group accepts it.
- Non-goals (v1): chat, comments or reactions, several commitments per group, public or searchable groups, blocking or reporting, ranking across groups, splitting fines among members, any payment.
- Anti-goals: anything that looks like a wager (money redistributed to "winners"); a member owing money they never agreed to; members seeing anything of a non-friend beyond the one habit tied to the group; a group whose bookkeeping can be edited after a week is closed.

## Concepts

- **Grupo**: name (3–40), icon (one of the habit icons), colour (one of the habit colour keys), optional description (≤ 140), time zone (the creator's at creation; weeks run Monday–Sunday in it). At most 50 active members. A person can be in at most 10 groups.
- **Compromiso**: exactly one per group: name, icon, times per week (1–7; 7 reads "todos los días"), and whether a photo is required. Changing it applies from the next week.
- **Miembro**: role `admin` or `member`. The creator is admin; at most 3 admins. Each member takes part with one personal habit linked to the group: on joining, the commitment's habit is created for them (same creation path and same-name reuse rule as Task 34), or they pick an eligible habit of theirs. A linked habit cannot be private, cannot change its photo requirement or frequency below the commitment, and cannot be a quantity habit, while linked (guards raising `habit_in_group`, like the challenge guards).
- **Semana**: the period. A member "cumplió" when their linked habit has at least the target number of valid check-ins in the week (photo commitments count only non-rejected check-ins with a photo). A member who joined after Monday starts counting the following Monday.

## What a member sees

- `/grupos` (reached from the Retos tab through a two-option switch "Retos | Grupos"): my groups with this week's "cumplen N de M" and my own progress; "Crear grupo"; an entry to join with a link.
- `/grupos/[id]`:
  - **Tablero**: every member with done/target this week, ordered by progress; the group streak (consecutive closed weeks in which at least half of the counted members complied); closed weeks with who complied.
  - **Muro**: check-ins of the linked habits (photo, name, date, own streak), newest first, 20 per page.
  - **Miembros**: list with roles; admins invite (link valid 7 days, capped by the free seats), remove a member, name or remove admins; anyone can leave.
  - **Fondo** (only when a fine exists or existed): see below.
- Hoy: the linked habit row carries a small chip with the group's name; checking in works exactly as today.
- Invitation page `/grupos/unirse/[code]` (public preview): group name, icon, commitment, number of members and, if a fine is active, its amount and purpose. Never member names. Joining requires an account and shows, before confirming: "Los miembros verán tus registros y fotos de este hábito."

## Privacy

Members of a group see of each other: name, @usuario, avatar, and the check-ins (date, photo, streak) of the ONE habit linked to that group. Nothing else: no other habits, no logged amounts, titles, weight or notes. Leaving the group, or unlinking, ends that visibility at once. Groups are invite-only and never listed anywhere. This is the first place where non-friends see a person's photos: it needs the explicit line at join, an update of the privacy page and the terms, and should get the same legal look already pending for the app.

## The optional fine

- An admin proposes: amount per missed week (CLP, whole pesos, 1 to 100.000), and the purpose of the fund in the group's words (≤ 80 characters, e.g. "Asado de fin de mes"). This is the reading of "igual se puede definir": the group defines what the fund is for.
- Every member accepts or declines within 7 days. The fine becomes active from the following Monday once the acceptances reach at least half of the members counted when it was proposed; otherwise it expires.
- It binds only the members who accepted. Others stay in the group with shared progress and no fine. A member can accept later (effective next Monday) or step out (effective next Monday, never retroactive). New members are asked when they join.
- When a week closes, every bound member who did not comply gets one debt to the fund for that week. Copy: "Le debes $X al fondo de <grupo>". The fund view shows registered, paid and pending totals and each person's pending amount, to every member.
- The money is kept outside the app. Admins mark a debt as paid or unmark it. "La app solo registra. El pago se hace fuera de la app." stays on every screen that shows money.
- Changing the amount or the purpose is a new proposal with a new vote. An admin can end the fine from the next Monday without a vote (it only removes obligations).
- With a photo commitment, an admin can reject a member's photo within 24 hours with a reason (never their own; with a single admin, that admin's photos cannot be rejected, and the fine proposal screen says so). A rejected photo does not count. A week closes only after the 24-hour window of its last photos, as challenges do today.
- Debts to a fund appear in Deudas under "Fondos de grupo", separate from the pairwise balance.

## Membership changes

Leaving or being removed: the running week is not evaluated for that person, debts already recorded stay, the habit stays theirs and is unlinked. The last admin cannot leave without naming another admin or archiving the group. Deleting an account removes the memberships; recorded debts keep their history. An archived group is read-only.

## How (decided)

- New tables, all with RLS and written only through SECURITY DEFINER RPCs (`search_path = ''`, caller from `auth.uid()`): groups, members (with the linked habit), group invites, fine proposals, fine acceptances, closed weeks, per-member week results, fund debts. Reads are limited to active members; the invitation preview is the only anonymous read.
- Visibility of check-ins and photos gains one branch: the caller and the owner are active members of the group the habit is linked to. It is added to the existing policies of `habits`, `checkins`, `checkin_items` and the `proofs` bucket through one definer helper; nothing else in those policies changes.
- Weeks are closed by the existing close-periods cron, in a group pass: one query per group for the week's check-ins (no per-member queries), results and debts written idempotently, the closed-week row last. Deleting a check-in of a linked habit after its week closed is refused like `period_closed` today.
- The board is one round trip (an RPC returning the week's counts per member); the wall is keyset-paginated.
- Notifications (new types): fine proposed, fine active or expired, week closed, debt to the fund, photo rejected, member joined (to admins).

## Delivery, in four shippable steps

1. Database core: tables, RPCs, the visibility branch, guards, tests (migration 0023; the owner runs it on the hosted project).
2. App: create, join, leave, board, wall, members, Hoy chip, invitation page.
3. Weekly closing, history and group streak, notifications.
4. The fine: proposal and vote, fund debts, Deudas section, photo rejection by admins (migration 0024).

Each step gets its own review; steps 1 and 4 get a security review before their migration is applied.

## Left to the builder

Table and function names, index choices, exact layout of the four views within the design system, the wording of secondary errors, how the two-option switch on Retos is implemented.
