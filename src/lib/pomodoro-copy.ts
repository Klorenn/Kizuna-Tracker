import type { PomodoroState } from "@/domain/pomodoro";
import { formatDuration } from "@/domain/time";
import type { PomodoroSession } from "@/lib/pomodoro-core";

/** Spanish copy of the Pomodoro screen, shared by the web screen and the native one. Pure. */

export const topicLabel = (preset: string | null) => (preset === "study" ? "Qué estudiaste (opcional)" : "Tema (opcional)");
export const RANGE_MESSAGE = "Elige entre 1 y 90 minutos.";
export const TOPIC_MAX_MESSAGE = "El tema tiene hasta 60 caracteres.";
export const PAUSED_NOTE = "En pausa.";
export const WAITING_NOTE = "Pendiente de sumar.";
export const STORAGE_PROBLEM = "No pudimos guardar el temporizador en este dispositivo.";

/** The small label over the clock while rounds are in play. */
export function phaseLabel(s: PomodoroState): string {
  if (s.phase === "focus") return s.config.cycles === null ? `Foco · ronda ${s.cycle}` : `Foco · ronda ${s.cycle} de ${s.config.cycles}`;
  if (s.phase === "break") return "Descanso";
  return s.phase === "ready" ? "Listo" : "Terminado";
}

/** The status line of a Pomodoro (rounds mode): what the server said about the last block, the rest ended, the summary. */
export function pomodoroStatusLine(s: PomodoroState, session: PomodoroSession, habitName: string): string | null {
  if (s.phase === "break") {
    if (session.lastStatus === "confirmed") return `Sumamos ${session.last} min a ${habitName}.`;
    if (session.lastStatus === "pending") return `Pendiente de sumar: ${session.last} min.`;
    return null;
  }
  if (s.phase === "ready") return "Descanso terminado.";
  if (s.phase === "done") {
    return session.blocks === 0
      ? "Sin bloques esta vez: un bloque cuenta desde 1 minuto de foco."
      : `${session.blocks} ${session.blocks === 1 ? "pomodoro" : "pomodoros"} · ${formatDuration(session.minutes)}`;
  }
  return null;
}

export type PhaseEndInfo =
  | { kind: "focus"; habitName: string; minutes: number; lastRound: boolean }
  | { kind: "break"; habitName: string };

/** Title and body for the end of a focus or a rest (web notification and the native scheduled one). */
export function blockEndText(end: PhaseEndInfo): { title: string; body: string } {
  if (end.kind === "break") return { title: "Terminó el descanso", body: "Listo para otra ronda." };
  return {
    title: "Terminó el foco",
    body: `${end.minutes} min de foco en ${end.habitName}.${end.lastRound ? "" : " Toma un descanso."}`,
  };
}
