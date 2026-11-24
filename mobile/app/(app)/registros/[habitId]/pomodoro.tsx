import { useQueryClient } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PomodoroConfig, TimerMode } from "@/domain/pomodoro";
import { addPomodoroBlockRpc } from "@/lib/tracking-rpc";
import { configFor, loadPrefs, savePrefs, type PomodoroPresetKey, type PomodoroPrefs } from "@/lib/pomodoro-core";
import { createRetryScheduler } from "@/lib/pomodoro-sync";
import { useCachedToday } from "../../../../src/data/use-cached-today";
import { supabase } from "../../../../src/lib/supabase";
import { PomodoroPanel } from "../../../../src/pomodoro/PomodoroPanel";
import { usePomodoro, useNow } from "../../../../src/pomodoro/use-pomodoro";
import { createEngineFor, storageFor } from "../../../../src/pomodoro/wiring";

/**
 * registros/[habitId]/pomodoro: "Medir tiempo" with the web's flow (rounds, breaks, pause, timer, stopwatch). The state is
 * the shared reducer over MMKV, each phase end is a scheduled local notification, and every closed block is credited by id
 * (retried with backoff while the network fails; blocks finished while the app was killed are credited from Hoy).
 */
export default function PomodoroScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { userId, view: today } = useCachedToday();
  const row = today?.rows.find((r) => r.id === habitId) ?? null;
  const storage = useMemo(() => storageFor(userId), [userId]);
  const [prefs, setPrefs] = useState<PomodoroPrefs>(() => loadPrefs(habitId, storage));
  const habitName = row?.name ?? prefs.habitName;
  const engine = useMemo(() => createEngineFor(userId, habitId, habitName), [userId, habitId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.setHabitName(habitName), [engine, habitName]);
  const { box, act } = usePomodoro(engine);
  const [notice, setNotice] = useState<string | null>(null);
  const [credited, setCredited] = useState<number | null>(null);
  const timeLog = row?.log?.kind === "time" ? row.log.minutes : 0;
  const todayMinutes = credited ?? timeLog;

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const zone = today?.timeZone ?? "UTC";
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const update = useCallback(
    (next: PomodoroPrefs) => {
      setPrefs(next);
      savePrefs(habitId, next, storage);
    },
    [habitId, storage],
  );

  // the screen opens on the last mode used; a running or finished timer tells the prefs which mode it is in
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    const p = prefsRef.current;
    if (box.s.mode === p.mode) return;
    if (box.s.phase === "idle") act.setMode(p.mode, configFor(p.mode, p));
    else update({ ...p, mode: box.s.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // send what is pending: when a block closes, on mount and with the web's capped backoff while sends fail
  const scheduler = useMemo(
    () =>
      createRetryScheduler({
        run: async () => {
          const r = await engine.flush((h, b, t) => addPomodoroBlockRpc(supabase(), h, b, t), prefsRef.current.topic.trim() || null, zoneRef.current);
          act.sync();
          if (r.totalMinutes !== null) setCredited(r.totalMinutes);
          if (r.lines.length > 0) setNotice(r.lines.join(" "));
          if (r.credited) void qc.invalidateQueries({ queryKey: ["today", userId] });
          return r.retryable;
        },
      }),
    [engine, act, qc, userId],
  );
  useEffect(() => () => scheduler.stop(), [scheduler]);
  const pendingCount = box.s.pending.length;
  useEffect(() => {
    if (pendingCount > 0) scheduler.kick();
  }, [pendingCount, scheduler]);

  const running = box.s.phase === "focus" || box.s.phase === "break";
  const ticking = running && box.s.pausedAt === null;
  useEffect(() => {
    if (ticking) void activateKeepAwakeAsync("pomodoro").catch(() => undefined);
    else void deactivateKeepAwake("pomodoro").catch(() => undefined);
    return () => void deactivateKeepAwake("pomodoro").catch(() => undefined);
  }, [ticking]);
  const now = useNow(ticking);

  const onMode = (mode: TimerMode) => {
    setNotice(null);
    update({ ...prefs, mode });
    act.setMode(mode, configFor(mode, prefs));
  };
  const onStart = (config: PomodoroConfig, preset: PomodoroPresetKey, topic: string) => {
    update({ ...prefs, preset, config, topic, habitName });
    setNotice(null);
    act.configure(config, "pomodoro");
    act.start();
  };
  const onStartMeasure = (topic: string) => {
    update({ ...prefs, topic, habitName });
    setNotice(null);
    act.start();
  };
  const onPickTimerMin = (min: number) => {
    update({ ...prefs, timerMin: min });
    act.configure({ ...prefs.config, focusMin: min }, "timer");
  };
  const onMute = () => {
    update({ ...prefs, muted: !prefs.muted });
    engine.resync();
  };
  return (
    <PomodoroPanel
      row={row}
      box={box}
      prefs={prefs}
      now={now}
      todayMinutes={todayMinutes}
      notice={notice}
      onMode={onMode}
      onStart={onStart}
      onStartMeasure={onStartMeasure}
      onPickTimerMin={onPickTimerMin}
      onPause={act.pause}
      onResume={act.resume}
      onSkip={act.skip}
      onFinish={act.finish}
      onNext={act.start}
      onReset={() => {
        setNotice(null);
        act.reset();
      }}
      onMute={onMute}
      onBack={() => router.back()}
    />
  );
}
