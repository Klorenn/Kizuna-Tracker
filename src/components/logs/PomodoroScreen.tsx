"use client";

import {
  Bell,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
  SpeakerHigh,
  SpeakerSlash,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendPomodoroBlock } from "@/app/(app)/registros/time-actions";
import { CatAnimation } from "@/components/brand/CatAnimation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { TopBar } from "@/components/ui/TopBar";
import {
  POMODORO_PRESETS,
  pomodoroView,
  validatePomodoroConfig,
  type PomodoroConfig,
  type PomodoroState,
} from "@/domain/pomodoro";
import { formatClock, formatDuration } from "@/domain/time";
import {
  blockEndAlert,
  canOfferNotifications,
  primeAudio,
  readNotificationEnv,
  useWakeLock,
  type NotificationEnv,
} from "@/lib/pomodoro-alerts";
import {
  loadPrefs,
  savePrefs,
  useNow,
  usePomodoro,
  type PhaseEnd,
  type PomodoroPrefs,
  type PomodoroPresetKey,
} from "@/lib/pomodoro-store";
import { flushPendingDetailed } from "@/lib/pomodoro-sync";

/*
 * PomodoroScreen: the timer of one habit (`/habitos/<id>/pomodoro`).
 *
 *   <PomodoroScreen habitId habitName preset todayMinutes />
 *   - habitId / habitName: the `time` habit it counts for.
 *   - preset: the habit's preset key ("study" labels the topic "Qué estudiaste", else "Tema").
 *   - todayMinutes: today's total when the page rendered (it follows the server answers after).
 *
 * The state is derived from stored instants (src/domain/pomodoro.ts), so only `Clock` redraws every
 * quarter second; the rest of the screen re-renders when the phase changes.
 */

const topicLabel = (preset: string | null) => (preset === "study" ? "Qué estudiaste (opcional)" : "Tema (opcional)");

export function PomodoroScreen(props: { habitId: string; habitName: string; preset: string | null; todayMinutes: number }) {
  // the stored preferences only exist in the browser: read them after mount
  const [prefs, setPrefs] = useState<PomodoroPrefs | null>(null);
  useEffect(() => {
    setPrefs(loadPrefs(props.habitId, window.localStorage));
  }, [props.habitId]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${props.habitId}`} />
      <h1 className="text-title font-semibold text-ink">Pomodoro · {props.habitName}</h1>
      {prefs ? <Timer {...props} initialPrefs={prefs} /> : <div className="min-h-[420px]" aria-busy="true" />}
    </main>
  );
}

function Timer({
  habitId,
  habitName,
  preset,
  todayMinutes,
  initialPrefs,
}: {
  habitId: string;
  habitName: string;
  preset: string | null;
  todayMinutes: number;
  initialPrefs: PomodoroPrefs;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [notice, setNotice] = useState<string | null>(null);
  const [today, setToday] = useState(todayMinutes);
  const [env, setEnv] = useState<NotificationEnv | null>(null);
  const [fresh, setFresh] = useState(0);
  const topicRef = useRef(prefs.topic);
  const mutedRef = useRef(prefs.muted);
  useEffect(() => {
    topicRef.current = prefs.topic;
    mutedRef.current = prefs.muted;
  });
  useEffect(() => setToday(todayMinutes), [todayMinutes]);
  useEffect(() => setEnv(readNotificationEnv()), []);

  const onEnd = useCallback(
    (end: PhaseEnd) => {
      blockEndAlert(
        end.kind === "focus"
          ? { kind: "focus", habitId, habitName, minutes: end.minutes, lastRound: end.lastRound }
          : { kind: "break", habitId, habitName },
        mutedRef.current,
      );
    },
    [habitId, habitName],
  );
  const { state, session, hydrated, act, getState } = usePomodoro(habitId, prefs.config, onEnd);

  const running = state.phase === "focus" || state.phase === "break";
  useWakeLock(running && state.pausedAt === null);

  // Send what is pending: when a block closes, on mount, when the network or the tab returns, and
  // every 15 s while something is still waiting.
  const flush = useCallback(async () => {
    const s = getState();
    if (s.pending.length === 0) return;
    const report = await flushPendingDetailed(s, sendPomodoroBlock, topicRef.current.trim() || null);
    if (report.events.length > 0) act.apply(report.events);
    if (report.totalMinutes !== null) setToday(report.totalMinutes);
    if (report.dropped.length > 0) setNotice(report.dropped.map((d) => d.message).join(" "));
  }, [act, getState]);
  const pendingCount = state.pending.length;
  useEffect(() => {
    if (!hydrated || pendingCount === 0) return;
    void flush();
    const id = window.setInterval(() => void flush(), 15_000);
    return () => window.clearInterval(id);
  }, [hydrated, pendingCount, flush]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  function update(next: PomodoroPrefs) {
    setPrefs(next);
    savePrefs(habitId, next, window.localStorage);
  }

  function start(config: PomodoroConfig, presetKey: PomodoroPresetKey, topic: string) {
    primeAudio();
    update({ ...prefs, preset: presetKey, config, topic });
    topicRef.current = topic;
    setNotice(null);
    act.configure(config);
    act.start();
  }

  async function askNotifications() {
    try {
      await Notification.requestPermission();
    } finally {
      setEnv(readNotificationEnv());
    }
  }

  if (!hydrated) return <div className="min-h-[420px]" aria-busy="true" />;

  const view = pomodoroView(state, 0);
  const pausedNote = state.pausedAt !== null ? "En pausa." : null;
  const status =
    state.phase === "break"
      ? session.last > 0
        ? `Sumamos ${session.last} min a ${habitName}.`
        : null
      : state.phase === "ready"
        ? "Descanso terminado."
        : state.phase === "done"
          ? session.blocks === 0
            ? "Sin bloques esta vez: un bloque cuenta desde 1 minuto de foco."
            : `${session.blocks} ${session.blocks === 1 ? "pomodoro" : "pomodoros"} · ${formatDuration(session.minutes)}`
          : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <IconButton
          label={prefs.muted ? "Activar sonido" : "Silenciar aviso"}
          aria-pressed={prefs.muted}
          onClick={() => update({ ...prefs, muted: !prefs.muted })}
        >
          {prefs.muted ? <SpeakerSlash size={20} weight="light" aria-hidden /> : <SpeakerHigh size={20} weight="light" aria-hidden />}
        </IconButton>
      </div>

      {state.phase === "idle" ? (
        <IdlePanel
          key={fresh}
          prefs={prefs}
          preset={preset}
          today={today}
          onStart={start}
        />
      ) : (
        <section className="flex flex-col items-center gap-4" aria-label="Temporizador">
          {state.phase === "focus" || state.phase === "break" ? (
            <>
              <p className="section-label text-muted">
                {state.phase === "focus"
                  ? view.cyclesTotal === null
                    ? `FOCO · RONDA ${state.cycle}`
                    : `FOCO · RONDA ${state.cycle} DE ${view.cyclesTotal}`
                  : "DESCANSO"}
              </p>
              <CatAnimation asset={state.phase === "focus" ? "code" : "sleep"} width={96} />
              <Clock state={state} />
            </>
          ) : (
            <>
              <p className="section-label text-muted">{state.phase === "ready" ? "LISTO" : "TERMINADO"}</p>
              <CatAnimation asset="sleep" width={96} variant="still" />
            </>
          )}
        </section>
      )}

      <div role="status" aria-live="polite" className="flex min-h-5 flex-col items-center gap-1 text-center">
        {pausedNote || status ? (
          <p className="text-small text-pretty text-ink">{[pausedNote, status].filter(Boolean).join(" ")}</p>
        ) : null}
        {notice ? (
          <p className="flex items-start justify-center gap-1 text-small text-pretty text-ink">
            <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
            {notice}
          </p>
        ) : null}
      </div>

      {state.phase === "focus" || state.phase === "break" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {state.pausedAt === null ? (
              <Button onClick={act.pause}>
                <Pause size={20} weight="light" aria-hidden />
                Pausar
              </Button>
            ) : (
              <Button onClick={act.resume}>
                <Play size={20} weight="light" aria-hidden />
                Reanudar
              </Button>
            )}
            <Button variant="secondary" onClick={act.skip}>
              <SkipForward size={20} weight="light" aria-hidden />
              {state.phase === "focus" ? "Saltar" : "Saltar descanso"}
            </Button>
          </div>
          <Button variant="ghost" onClick={act.finish}>
            {state.phase === "focus" ? "Terminar ahora" : "Terminar"}
          </Button>
        </div>
      ) : null}
      {state.phase === "ready" ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => {
              primeAudio();
              act.start();
            }}
          >
            Siguiente ronda
          </Button>
          <Button variant="secondary" onClick={act.finish}>
            Terminar
          </Button>
        </div>
      ) : null}
      {state.phase === "done" ? (
        <>
          {today > 0 ? (
            <p className="text-center font-mono text-body text-ink">
              Hoy: {formatDuration(today)}
              {prefs.topic.trim() ? ` · ${prefs.topic.trim()}` : ""}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                act.reset();
                setFresh((n) => n + 1);
              }}
            >
              Otra sesión
            </Button>
            <ButtonLink href="/">Volver a Hoy</ButtonLink>
          </div>
        </>
      ) : null}

      {env && canOfferNotifications(env) ? (
        <Button variant="ghost" onClick={askNotifications}>
          <Bell size={20} weight="light" aria-hidden />
          Avisarme al terminar
        </Button>
      ) : null}

      {state.phase !== "idle" && state.phase !== "done" ? (
        <p className="text-center text-small text-muted">
          Los minutos se suman a{" "}
          <Link href={`/habitos/${habitId}/tiempo`} className="text-accent underline underline-offset-2">
            tu tiempo de hoy
          </Link>{" "}
          al terminar cada foco.
        </p>
      ) : null}
    </div>
  );
}

/** The only element that redraws every 250 ms: readout and progress ring. */
function Clock({ state }: { state: PomodoroState }) {
  const ticking = (state.phase === "focus" || state.phase === "break") && state.pausedAt === null;
  const now = useNow(ticking);
  const v = pomodoroView(state, now);
  const duration = (state.phase === "focus" ? state.config.focusMin : state.config.breakMin) * 60_000;
  const fraction = duration > 0 ? Math.min(1, Math.max(0, v.elapsedMs / duration)) : 0;
  const r = 100;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-60 place-items-center">
      <svg viewBox="0 0 224 224" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="112" cy="112" r={r} fill="none" strokeWidth="8" className="stroke-field" />
        <circle
          cx="112"
          cy="112"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="stroke-accent"
        />
      </svg>
      <p role="timer" className="font-mono text-[56px] font-medium leading-none tracking-tight text-ink">
        {formatClock(v.remainingMs)}
      </p>
    </div>
  );
}

function IdlePanel({
  prefs,
  preset,
  today,
  onStart,
}: {
  prefs: PomodoroPrefs;
  preset: string | null;
  today: number;
  onStart: (config: PomodoroConfig, preset: PomodoroPresetKey, topic: string) => void;
}) {
  const [key, setKey] = useState<PomodoroPresetKey>(prefs.preset);
  const [focusMin, setFocusMin] = useState(String(prefs.config.focusMin));
  const [breakMin, setBreakMin] = useState(String(prefs.config.breakMin));
  const [cycles, setCycles] = useState(prefs.config.cycles ?? 4);
  const [unlimited, setUnlimited] = useState(prefs.config.cycles === null);
  const [topic, setTopic] = useState(prefs.topic);
  const [error, setError] = useState<string | null>(null);

  function choose(next: PomodoroPresetKey) {
    setKey(next);
    setError(null);
    const p = POMODORO_PRESETS.find((x) => x.key === next);
    if (p) {
      setFocusMin(String(p.focusMin));
      setBreakMin(String(p.breakMin));
    }
  }

  function begin() {
    const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
    const config: PomodoroConfig = { focusMin: num(focusMin), breakMin: num(breakMin), cycles: unlimited ? null : cycles };
    const valid = validatePomodoroConfig(config);
    if (!valid.ok) return setError(valid.error);
    if (topic.length > 60) return setError("El tema tiene hasta 60 caracteres.");
    onStart(config, key, topic);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Duración del foco y el descanso">
        {POMODORO_PRESETS.map((p) => (
          <Chip key={p.key} selected={key === p.key} onClick={() => choose(p.key)}>
            {p.focusMin}/{p.breakMin}
          </Chip>
        ))}
        <Chip selected={key === "custom"} onClick={() => choose("custom")}>
          Personalizado
        </Chip>
      </div>
      {key === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Foco (min)"
            name="pomodoro-focus"
            inputMode="numeric"
            value={focusMin}
            className="font-mono"
            onChange={(e) => setFocusMin(e.target.value)}
          />
          <Input
            label="Descanso (min)"
            name="pomodoro-break"
            inputMode="numeric"
            value={breakMin}
            className="font-mono"
            onChange={(e) => setBreakMin(e.target.value)}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span id="pomodoro-rounds" className="text-small text-ink">
          Rondas
        </span>
        <div className="flex items-center gap-1" role="group" aria-labelledby="pomodoro-rounds">
          <IconButton label="Menos rondas" disabled={unlimited || cycles <= 1} onClick={() => setCycles((n) => Math.max(1, n - 1))}>
            <Minus size={20} weight="light" aria-hidden />
          </IconButton>
          <output className="w-10 text-center font-mono text-body font-medium text-ink" aria-live="polite">
            {unlimited ? "∞" : cycles}
          </output>
          <IconButton label="Más rondas" disabled={unlimited || cycles >= 12} onClick={() => setCycles((n) => Math.min(12, n + 1))}>
            <Plus size={20} weight="light" aria-hidden />
          </IconButton>
        </div>
      </div>
      <Checkbox label="Sin límite" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
      <Input
        label={topicLabel(preset)}
        name="pomodoro-topic"
        value={topic}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => setTopic(e.target.value)}
      />
      {today > 0 ? <p className="font-mono text-body text-ink">Hoy: {formatDuration(today)}</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button onClick={begin}>Empezar foco</Button>
    </div>
  );
}
