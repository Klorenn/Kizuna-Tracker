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
} from "@phosphor-icons/react";
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
import { ModeSwitch } from "@/components/logs/ModeSwitch";
import {
  formatReadout,
  POMODORO_PRESETS,
  pomodoroView,
  sessionSummary,
  STOPWATCH_BLOCK_MIN,
  STOPWATCH_CAP_MIN,
  TIMER_CHIPS,
  validatePomodoroConfig,
  type PomodoroConfig,
  type PomodoroState,
  type TimerMode,
} from "@/domain/pomodoro";
import { formatDuration } from "@/domain/time";
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
  openPomodoroStorage,
  savePrefs,
  useNow,
  usePomodoro,
  type PhaseEnd,
  type PomodoroPrefs,
  type PomodoroStorage,
  type PomodoroPresetKey,
} from "@/lib/pomodoro-store";
import { createRetryScheduler, flushPendingDetailed, reportLines } from "@/lib/pomodoro-sync";

/*
 * PomodoroScreen: "Medir tiempo" for one habit (`/habitos/<id>/pomodoro`): three ways to measure,
 * one at a time: Pomodoro (rounds of focus and rest), Temporizador (pick minutes, counts down) and
 * Cronómetro (counts up; closes a block every 90 minutes and stops at 4 hours).
 *
 *   <PomodoroScreen habitId habitName preset todayMinutes />
 *   - habitId / habitName: the `time` habit it counts for.
 *   - preset: the habit's preset key ("study" labels the topic "Qué estudiaste", else "Tema").
 *   - todayMinutes: today's total when the page rendered (it follows the server answers after).
 *
 * The state is derived from stored instants (src/domain/pomodoro.ts), so only `Clock` redraws every
 * quarter second; the rest of the screen re-renders when the phase changes. The mode can change only
 * while nothing runs; the last one used is remembered per user and habit (the prefs).
 */

const topicLabel = (preset: string | null) => (preset === "study" ? "Qué estudiaste (opcional)" : "Tema (opcional)");

const MIN_MS = 60_000;
const CAP_MESSAGE = "El cronómetro se detuvo a las 4 horas. Si seguiste, agrega el resto a mano.";
const SHORT_MESSAGE = "Menos de un minuto no se suma.";
const RANGE_MESSAGE = "Elige entre 1 y 90 minutos.";

/** The configuration a mode starts with: the timer takes its minutes from the prefs, the others keep theirs. */
const configFor = (mode: TimerMode, p: PomodoroPrefs): PomodoroConfig =>
  mode === "timer" ? { ...p.config, focusMin: p.timerMin } : p.config;

export function PomodoroScreen(props: {
  habitId: string;
  habitName: string;
  preset: string | null;
  todayMinutes: number;
  /** The signed-in user: every stored key is namespaced by it. */
  userId: string;
  /** The profile time zone: decides which local day a block belongs to. */
  timeZone: string;
}) {
  // the stored preferences only exist in the browser: read them after mount
  const [boot, setBoot] = useState<{ storage: PomodoroStorage; prefs: PomodoroPrefs } | null>(null);
  useEffect(() => {
    const storage = openPomodoroStorage(props.userId);
    setBoot({ storage, prefs: loadPrefs(props.habitId, storage) });
  }, [props.habitId, props.userId]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${props.habitId}`} />
      <h1 className="text-title font-semibold text-ink">Medir tiempo · {props.habitName}</h1>
      {boot ? (
        <Timer {...props} storage={boot.storage} initialPrefs={boot.prefs} />
      ) : (
        <div className="min-h-96" aria-busy="true" />
      )}
    </main>
  );
}

function Timer({
  habitId,
  habitName,
  preset,
  todayMinutes,
  timeZone,
  storage,
  initialPrefs,
}: {
  habitId: string;
  habitName: string;
  preset: string | null;
  todayMinutes: number;
  timeZone: string;
  storage: PomodoroStorage;
  initialPrefs: PomodoroPrefs;
}) {
  const [prefs, setPrefs] = useState({ ...initialPrefs, habitName });
  const [notice, setNotice] = useState<string | null>(null);
  const [today, setToday] = useState(todayMinutes);
  const [env, setEnv] = useState<NotificationEnv | null>(null);
  const [fresh, setFresh] = useState(0);
  /** The custom minutes of the timer are out of range: "Empezar" waits for a valid value. */
  const [rangeError, setRangeError] = useState(false);
  const topicRef = useRef(prefs.topic);
  const mutedRef = useRef(prefs.muted);
  const controlsRef = useRef<HTMLDivElement>(null);
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
  const { state, session, hydrated, storageProblem, act, getState } = usePomodoro(
    habitId,
    configFor(initialPrefs.mode, initialPrefs),
    { storage, mode: initialPrefs.mode, onPhaseEnd: onEnd },
  );
  const mode = state.mode;
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  });

  const running = state.phase === "focus" || state.phase === "break";
  useWakeLock(running && state.pausedAt === null);

  // Send what is pending: when a block closes, on mount, when the network or the tab returns, and
  // with a capped exponential backoff (1 s ... 30 s) while sends keep failing. A block that ended on
  // an earlier local day is never sent: it leaves the queue with a message.
  const runFlush = useCallback(async (): Promise<boolean> => {
    const s = getState();
    if (s.pending.length === 0) return false;
    const report = await flushPendingDetailed(s, sendPomodoroBlock, topicRef.current.trim() || null, {
      timeZone,
      now: Date.now(),
    });
    if (report.events.length > 0) act.apply(report.events);
    if (report.totalMinutes !== null) setToday(report.totalMinutes);
    const lines = reportLines(report);
    if (lines.length > 0) setNotice(lines.join(" "));
    return report.retryable > 0;
  }, [act, getState, timeZone]);
  const runRef = useRef(runFlush);
  const schedulerRef = useRef<ReturnType<typeof createRetryScheduler> | null>(null);
  useEffect(() => {
    runRef.current = runFlush;
  });
  useEffect(() => {
    const scheduler = createRetryScheduler({ run: () => runRef.current() });
    schedulerRef.current = scheduler;
    const kick = () => scheduler.kick();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduler.kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      scheduler.stop();
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const pendingCount = state.pending.length;
  useEffect(() => {
    if (hydrated && pendingCount > 0) schedulerRef.current?.kick();
  }, [hydrated, pendingCount]);

  // when the phase changes the focused button unmounts: keep focus on the controls
  const phase = state.phase;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    if (document.activeElement === document.body || document.activeElement === null) {
      controlsRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  function update(next: PomodoroPrefs) {
    setPrefs(next);
    savePrefs(habitId, next, storage);
  }

  // the screen opens on the last mode used: an idle timer of another mode follows the prefs, a running
  // or finished one (it may come from another tab) tells the prefs which mode it is in
  const synced = useRef(false);
  useEffect(() => {
    if (!hydrated || synced.current) return;
    synced.current = true;
    const s = getState();
    const p = prefsRef.current;
    if (s.mode === p.mode) return;
    if (s.phase === "idle") act.setMode(p.mode, configFor(p.mode, p));
    else update({ ...p, mode: s.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function chooseMode(next: TimerMode) {
    if (next === mode) return;
    setNotice(null);
    setRangeError(false);
    setFresh((n) => n + 1);
    update({ ...prefs, mode: next });
    act.setMode(next, configFor(next, prefs));
  }

  function start(config: PomodoroConfig, presetKey: PomodoroPresetKey, topic: string) {
    primeAudio();
    update({ ...prefs, preset: presetKey, config, topic, habitName });
    topicRef.current = topic;
    setNotice(null);
    act.configure(config, "pomodoro");
    act.start();
  }

  /** Timer and stopwatch: the minutes were already applied to the idle state; this just starts. */
  function startMeasure(topic: string) {
    if (rangeError) return;
    primeAudio();
    update({ ...prefs, topic, habitName });
    topicRef.current = topic;
    setNotice(null);
    act.start();
  }

  function pickTimerMin(min: number) {
    update({ ...prefs, timerMin: min });
    act.configure({ ...prefs.config, focusMin: min }, "timer");
  }

  async function askNotifications() {
    try {
      await Notification.requestPermission();
    } finally {
      setEnv(readNotificationEnv());
    }
  }

  if (!hydrated) return <div className="min-h-96" aria-busy="true" />;

  const view = pomodoroView(state, 0);
  const measuring = mode !== "pomodoro";
  const locked = running || state.phase === "ready";
  const pausedNote = state.pausedAt !== null ? "En pausa." : null;
  const waiting = state.pending.length > 0 ? "Pendiente de sumar." : null;
  const summary = sessionSummary(state);
  // timer and stopwatch: what the server has said about this session's blocks so far
  const measureStatus =
    state.endReason === "cap"
      ? CAP_MESSAGE
      : state.tooShort && state.phase === "idle"
        ? SHORT_MESSAGE
        : state.phase === "idle"
          ? null
          : summary.status === "pending"
            ? `Pendiente de sumar: ${summary.pendingMin} min.`
            : summary.status === "confirmed"
              ? `Sumamos ${summary.confirmedMin} min a ${habitName}.`
              : null;
  const status = measuring
    ? measureStatus
    : state.phase === "break"
      ? session.lastStatus === "confirmed"
        ? `Sumamos ${session.last} min a ${habitName}.`
        : session.lastStatus === "pending"
          ? `Pendiente de sumar: ${session.last} min.`
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
      <ModeSwitch
        value={mode}
        locked={locked}
        onChange={chooseMode}
        trailing={
          <IconButton
            label="Silenciar avisos"
            aria-pressed={prefs.muted}
            onClick={() => update({ ...prefs, muted: !prefs.muted })}
          >
            {prefs.muted ? <SpeakerSlash size={20} weight="light" aria-hidden /> : <SpeakerHigh size={20} weight="light" aria-hidden />}
          </IconButton>
        }
      />

      {measuring ? (
        <section className="flex flex-col items-center gap-4" aria-label={mode === "timer" ? "Temporizador" : "Cronómetro"}>
          {/* fixed height: the picker, the hint and the cat share it, so the readout below never moves */}
          <div
            className={`flex h-40 w-full flex-col items-center gap-3 ${state.phase === "idle" ? "justify-start" : "justify-center"}`}
          >
            {state.phase === "idle" ? (
              mode === "timer" ? (
                <TimerPicker key={fresh} minutes={prefs.timerMin} onPick={pickTimerMin} onInvalid={setRangeError} />
              ) : (
                <p className="pt-2 text-center text-small text-pretty text-muted">
                  Cuenta hacia arriba hasta que termines. Cada {STOPWATCH_BLOCK_MIN} minutos se guarda un bloque y se detiene a las{" "}
                  {STOPWATCH_CAP_MIN / 60} horas.
                </p>
              )
            ) : (
              <>
                <p className="section-label text-muted">
                  {state.phase === "done" ? "TERMINADO" : mode === "timer" ? "TEMPORIZADOR" : "CRONÓMETRO"}
                </p>
                <CatAnimation
                  asset={state.phase === "done" ? "sleep" : "code"}
                  width={96}
                  variant={state.phase === "done" ? "still" : undefined}
                />
              </>
            )}
          </div>
          {state.phase === "done" ? (
            <ClockFace fraction={1} readout={formatDuration(session.minutes)} small />
          ) : (
            <Clock state={state} />
          )}
        </section>
      ) : state.phase === "idle" ? (
        <IdlePanel key={fresh} prefs={prefs} preset={preset} today={today} onStart={start} />
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
        {waiting && state.phase !== "break" && !measuring ? <p className="text-small text-muted">{waiting}</p> : null}
        {storageProblem ? (
          <p className="flex items-start justify-center gap-1 text-small text-pretty text-ink">
            <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
            No pudimos guardar el temporizador en este dispositivo.
          </p>
        ) : null}
        {notice || (rangeError && state.phase === "idle" && mode === "timer") ? (
          <p className="flex items-start justify-center gap-1 text-small text-pretty text-ink">
            <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
            {rangeError && state.phase === "idle" && mode === "timer" ? RANGE_MESSAGE : notice}
          </p>
        ) : null}
      </div>

      {measuring && state.phase === "idle" ? (
        <MeasureStart key={fresh} prefs={prefs} preset={preset} today={today} onStart={startMeasure} />
      ) : null}
      {measuring && running ? (
        <div ref={controlsRef} tabIndex={-1} className="grid grid-cols-2 gap-3 outline-none">
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
          <Button variant="secondary" onClick={act.finish}>
            Terminar
          </Button>
        </div>
      ) : null}
      {!measuring && (state.phase === "focus" || state.phase === "break") ? (
        <div ref={controlsRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
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
            <p className="text-center text-body text-ink">
              Hoy: <span className="font-mono">{formatDuration(today)}</span>
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
          {measuring ? (mode === "timer" ? "al terminar." : "al terminar y cada 90 minutos.") : "al terminar cada foco."}
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
  const block = STOPWATCH_BLOCK_MIN * MIN_MS;
  const duration = state.mode === "stopwatch" ? block : (state.phase === "break" ? state.config.breakMin : state.config.focusMin) * MIN_MS;
  const into = state.mode === "stopwatch" ? v.elapsedMs % block : v.elapsedMs;
  const fraction = duration > 0 ? Math.min(1, Math.max(0, into / duration)) : 0;
  return <ClockFace fraction={fraction} readout={formatReadout(v.displayMs, v.direction)} />;
}

/** The ring and the big figure. Hours ("1:05:09") need a smaller figure to fit inside it. */
function ClockFace({ fraction, readout, small = false }: { fraction: number; readout: string; small?: boolean }) {
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
      {/* a display figure, not prose: tight leading is intended */}
      <div
        role="timer"
        className={`font-mono font-medium leading-none tracking-tight text-ink ${
          small ? "text-3xl" : readout.length > 5 ? "text-5xl" : "text-6xl"
        }`}
      >
        {readout}
      </div>
    </div>
  );
}

/** Timer idle: the minutes (chips 15 / 25 / 45 / 60 and a custom value). It always fits `h-40`. */
function TimerPicker({
  minutes,
  onPick,
  onInvalid,
}: {
  minutes: number;
  onPick: (min: number) => void;
  onInvalid: (invalid: boolean) => void;
}) {
  const [custom, setCustom] = useState(!(TIMER_CHIPS as readonly number[]).includes(minutes));
  const [text, setText] = useState(String(minutes));
  const [invalid, setInvalid] = useState(false);

  function type(value: string) {
    setText(value);
    const t = value.trim();
    const n = /^\d+$/.test(t) ? Number(t) : Number.NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 90) {
      setInvalid(false);
      onInvalid(false);
      onPick(n);
    } else {
      setInvalid(true);
      onInvalid(true);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p id="timer-minutes" className="section-label text-muted">
        MINUTOS
      </p>
      <div className="flex gap-2" role="group" aria-labelledby="timer-minutes">
        {TIMER_CHIPS.map((m) => (
          <Chip
            key={m}
            selected={!custom && minutes === m}
            aria-label={`${m} minutos`}
            onClick={() => {
              setCustom(false);
              setInvalid(false);
              onInvalid(false);
              setText(String(m));
              onPick(m);
            }}
          >
            <span className="font-mono">{m}</span>
          </Chip>
        ))}
        <Chip
          selected={custom}
          onClick={() => {
            setCustom(true);
            setText(String(minutes));
          }}
        >
          Otro
        </Chip>
      </div>
      {custom ? (
        <Input
          label="Minutos (1 a 90)"
          name="timer-custom"
          inputMode="numeric"
          value={text}
          invalid={invalid}
          autoComplete="off"
          className="font-mono"
          onChange={(e) => type(e.target.value)}
        />
      ) : null}
    </div>
  );
}

/** Timer and stopwatch idle, below the readout: the topic, today's total and "Empezar". */
function MeasureStart({
  prefs,
  preset,
  today,
  onStart,
}: {
  prefs: PomodoroPrefs;
  preset: string | null;
  today: number;
  onStart: (topic: string) => void;
}) {
  const [topic, setTopic] = useState(prefs.topic);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Input
        label={topicLabel(preset)}
        name="pomodoro-topic"
        value={topic}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => setTopic(e.target.value)}
      />
      {today > 0 ? <p className="text-body text-ink">Hoy: <span className="font-mono">{formatDuration(today)}</span></p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button
        onClick={() => {
          if (topic.length > 60) return setError("El tema tiene hasta 60 caracteres.");
          onStart(topic);
        }}
      >
        Empezar
      </Button>
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
      {today > 0 ? <p className="text-body text-ink">Hoy: <span className="font-mono">{formatDuration(today)}</span></p> : null}
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
