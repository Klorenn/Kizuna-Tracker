import { HABIT_ICONS, type IconKey } from "@/domain/presets";
import type { GroupCommitment, GroupSummary } from "@/lib/groups-contract";

/** Icon keys come from the database: anything unexpected renders as the default. */
export function toGroupIcon(value: string): IconKey {
  return (HABIT_ICONS as readonly string[]).includes(value) ? (value as IconKey) : "target";
}

/** "<compromiso> · N por semana" ("todos los días" for 7), plus " · con foto" when required. */
export function commitmentLine(c: GroupCommitment): string {
  const times = c.targetPerWeek === 7 ? "todos los días" : `${c.targetPerWeek} por semana`;
  return `${c.name} · ${times}${c.requiresPhoto ? " · con foto" : ""}`;
}

export function memberCountLabel(n: number): string {
  return n === 1 ? "1 miembro" : `${n} miembros`;
}

/** The text lines of a group card. `streak` is null at 0 (the line is hidden). */
export function cardLines(g: GroupSummary): { week: string; mine: string; streak: string | null } {
  return {
    week: `Cumplen ${g.compliedCount} de ${g.countedCount} esta semana`,
    mine: g.myCounts ? `Tú: ${g.myDone} de ${g.commitment.targetPerWeek}` : "Empiezas el lunes",
    streak: g.streak > 0 ? `Racha del grupo: ${g.streak} ${g.streak === 1 ? "semana" : "semanas"}` : null,
  };
}
