import { describe, expect, it } from "vitest";
import { initialPomodoro, pomodoroReducer, type PomodoroState } from "@/domain/pomodoro";
import { EMPTY_SESSION } from "@/lib/pomodoro-core";
import {
  blockEndText,
  phaseLabel,
  pomodoroStatusLine,
  RANGE_MESSAGE,
  topicLabel,
  TOPIC_MAX_MESSAGE,
} from "@/lib/pomodoro-copy";

const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const base = (cycles: number | null = 4): PomodoroState => initialPomodoro("h", { focusMin: 25, breakMin: 5, cycles });
const focus = (cycles: number | null = 4) => pomodoroReducer(base(cycles), { type: "start", at: T0, blockId: "b1" });

describe("pomodoro copy", () => {
  it("topic label and messages", () => {
    expect(topicLabel("study")).toBe("Qué estudiaste (opcional)");
    expect(topicLabel(null)).toBe("Tema (opcional)");
    expect(topicLabel("other")).toBe("Tema (opcional)");
    expect(RANGE_MESSAGE).toBe("Elige entre 1 y 90 minutos.");
    expect(TOPIC_MAX_MESSAGE).toBe("El tema tiene hasta 60 caracteres.");
  });
  it("phase label: round x of y, unlimited rounds, break, ready, done", () => {
    expect(phaseLabel(focus())).toBe("Foco · ronda 1 de 4");
    expect(phaseLabel(focus(null))).toBe("Foco · ronda 1");
    expect(phaseLabel({ ...focus(), phase: "break" })).toBe("Descanso");
    expect(phaseLabel({ ...focus(), phase: "ready" })).toBe("Listo");
    expect(phaseLabel({ ...focus(), phase: "done" })).toBe("Terminado");
  });
  it("status line: break shows what the server said about the last block", () => {
    const brk = { ...focus(), phase: "break" as const };
    expect(pomodoroStatusLine(brk, { ...EMPTY_SESSION, last: 25, lastStatus: "confirmed" }, "Estudio")).toBe("Sumamos 25 min a Estudio.");
    expect(pomodoroStatusLine(brk, { ...EMPTY_SESSION, last: 25, lastStatus: "pending" }, "Estudio")).toBe("Pendiente de sumar: 25 min.");
    expect(pomodoroStatusLine(brk, EMPTY_SESSION, "Estudio")).toBeNull();
  });
  it("status line: ready and done", () => {
    expect(pomodoroStatusLine({ ...focus(), phase: "ready" }, EMPTY_SESSION, "E")).toBe("Descanso terminado.");
    const done = { ...focus(), phase: "done" as const };
    expect(pomodoroStatusLine(done, EMPTY_SESSION, "E")).toBe("Sin bloques esta vez: un bloque cuenta desde 1 minuto de foco.");
    expect(pomodoroStatusLine(done, { ...EMPTY_SESSION, blocks: 1, minutes: 25 }, "E")).toBe("1 pomodoro · 25 min");
    expect(pomodoroStatusLine(done, { ...EMPTY_SESSION, blocks: 3, minutes: 75 }, "E")).toBe("3 pomodoros · 1 h 15 min");
    expect(pomodoroStatusLine(focus(), EMPTY_SESSION, "E")).toBeNull();
  });
  it("end-of-phase text (alert and scheduled notification)", () => {
    expect(blockEndText({ kind: "focus", habitName: "Estudio", minutes: 25, lastRound: false })).toEqual({
      title: "Terminó el foco",
      body: "25 min de foco en Estudio. Toma un descanso.",
    });
    expect(blockEndText({ kind: "focus", habitName: "Estudio", minutes: 25, lastRound: true }).body).toBe("25 min de foco en Estudio.");
    expect(blockEndText({ kind: "break", habitName: "Estudio" })).toEqual({ title: "Terminó el descanso", body: "Listo para otra ronda." });
  });
});
