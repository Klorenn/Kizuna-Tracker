import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  formatReadout,
  measureStatusLines,
  POMODORO_PRESETS,
  pomodoroView,
  STOPWATCH_BLOCK_MIN,
  STOPWATCH_CAP_MIN,
  TIMER_CHIPS,
  validatePomodoroConfig,
  type PomodoroConfig,
  type TimerMode,
} from "@/domain/pomodoro";
import type { TodayRow } from "@/domain/today";
import { formatDuration } from "@/domain/time";
import type { PomodoroBox, PomodoroPresetKey, PomodoroPrefs } from "@/lib/pomodoro-core";
import {
  LOCKED_HINT,
  MODE_OPTIONS,
  PAUSED_NOTE,
  phaseLabel,
  pomodoroStatusLine,
  RANGE_MESSAGE,
  topicLabel,
  TOPIC_MAX_MESSAGE,
  WAITING_NOTE,
} from "@/lib/pomodoro-copy";
import { useTheme } from "../theme/ThemeProvider";

const MIN_MS = 60_000;

type Props = {
  row: TodayRow | null;
  box: PomodoroBox;
  prefs: PomodoroPrefs;
  /** the instant the readout is drawn for (the screen re-reads it while a phase runs) */
  now: number;
  todayMinutes: number;
  notice: string | null;
  onMode: (mode: TimerMode) => void;
  onStart: (config: PomodoroConfig, preset: PomodoroPresetKey, topic: string) => void;
  /** timer and stopwatch: the minutes were already applied to the idle state */
  onStartMeasure: (topic: string) => void;
  onPickTimerMin: (min: number) => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onNext: () => void;
  onReset: () => void;
  onMute: () => void;
  onBack: () => void;
};

/**
 * "Medir tiempo" for one habit, same flow and copy as the web: Pomodoro rounds with breaks, a countdown timer and a
 * count-up stopwatch; pause and resume; the mode changes only while nothing runs. State and rules come from the shared
 * reducer, this component only draws them.
 */
export function PomodoroPanel(p: Props) {
  const { colors, radius, space } = useTheme();
  const { s, session } = p.box;
  const back = (
    <Pressable accessibilityRole="button" onPress={p.onBack} hitSlop={8}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
    </Pressable>
  );
  if (!p.row) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}>
        {back}
        <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
      </View>
    );
  }
  const habitName = p.row.name;
  const running = s.phase === "focus" || s.phase === "break";
  const locked = running || s.phase === "ready";
  const measuring = s.mode !== "pomodoro";
  const primary = { backgroundColor: colors.accent, borderRadius: radius.md };
  const ghost = { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md };
  const text = { color: colors.text, fontSize: 14 };
  const Btn = ({ label, onPress, kind = "primary" }: { label: string; onPress: () => void; kind?: "primary" | "ghost" }) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.cta, kind === "primary" ? primary : ghost]}>
      <Text style={{ color: kind === "primary" ? colors.onAccent : colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  const view = pomodoroView(s, p.now);
  const paused = s.pausedAt !== null;
  const lines: string[] = [];
  if (paused) lines.push(PAUSED_NOTE);
  if (measuring) lines.push(...measureStatusLines(s, habitName));
  else {
    const line = pomodoroStatusLine(s, session, habitName);
    if (line) lines.push(line);
    if (s.pending.length > 0 && s.phase !== "break") lines.push(WAITING_NOTE);
  }
  if (p.notice) lines.push(p.notice);

  const clock =
    s.phase === "done" && measuring ? formatDuration(session.minutes) : formatReadout(view.displayMs, view.direction);
  const progress = (() => {
    if (s.phase !== "focus" && s.phase !== "break") return s.phase === "done" ? 1 : 0;
    const block = STOPWATCH_BLOCK_MIN * MIN_MS;
    const duration = s.mode === "stopwatch" ? block : (s.phase === "break" ? s.config.breakMin : s.config.focusMin) * MIN_MS;
    const into = s.mode === "stopwatch" ? view.elapsedMs % block : view.elapsedMs;
    return duration > 0 ? Math.min(1, Math.max(0, into / duration)) : 0;
  })();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
      {back}
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{`Medir tiempo · ${habitName}`}</Text>

      <View accessibilityRole="radiogroup" style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, padding: 4 }]}>
        {MODE_OPTIONS.map((o) => {
          const selected = o.value === s.mode;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: locked }}
              onPress={() => {
                if (!locked && !selected) p.onMode(o.value);
              }}
              style={[styles.mode, { borderRadius: radius.md }, selected ? { backgroundColor: colors.bg } : null]}
            >
              <Text style={{ color: colors.text, fontWeight: selected ? "600" : "400", fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>{locked ? LOCKED_HINT : " "}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Silenciar avisos" accessibilityState={{ selected: p.prefs.muted }} onPress={p.onMute} hitSlop={8}>
          <Text style={{ color: colors.accent, fontSize: 13 }}>{p.prefs.muted ? "Avisos en silencio" : "Silenciar"}</Text>
        </Pressable>
      </View>

      {s.phase === "idle" ? (
        measuring ? (
          <MeasureStart key={`m-${s.mode}`} mode={s.mode} prefs={p.prefs} preset={p.row.preset} today={p.todayMinutes} notice={lines} onPick={p.onPickTimerMin} onStart={p.onStartMeasure} />
        ) : (
          <IdlePanel prefs={p.prefs} preset={p.row.preset} today={p.todayMinutes} lines={lines} onStart={p.onStart} />
        )
      ) : (
        <>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
            {measuring ? (s.phase === "done" ? "Terminado" : s.mode === "timer" ? "Temporizador" : "Cronómetro") : phaseLabel(s)}
          </Text>
          <Text accessibilityRole="timer" style={{ color: colors.text, fontSize: clock.length > 5 ? 48 : 64, fontWeight: "600", textAlign: "center" }}>
            {clock}
          </Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.accent, width: `${Math.round(progress * 100)}%` }} />
          </View>
          {lines.map((l) => (
            <Text key={l} style={[text, { textAlign: "center" }]}>
              {l}
            </Text>
          ))}
          {running ? (
            <View style={{ gap: space.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Btn label={paused ? "Reanudar" : "Pausar"} onPress={paused ? p.onResume : p.onPause} />
                </View>
                {measuring ? (
                  <View style={{ flex: 1 }}>
                    <Btn label="Terminar" onPress={p.onFinish} kind="ghost" />
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Btn label={s.phase === "focus" ? "Saltar" : "Saltar descanso"} onPress={p.onSkip} kind="ghost" />
                  </View>
                )}
              </View>
              {!measuring ? <Btn label={s.phase === "focus" ? "Terminar ahora" : "Terminar"} onPress={p.onFinish} kind="ghost" /> : null}
            </View>
          ) : null}
          {s.phase === "ready" ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Btn label="Siguiente ronda" onPress={p.onNext} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="Terminar" onPress={p.onFinish} kind="ghost" />
              </View>
            </View>
          ) : null}
          {s.phase === "done" ? (
            <>
              {p.todayMinutes > 0 ? <Text style={[text, { textAlign: "center", fontSize: 16 }]}>{`Hoy: ${formatDuration(p.todayMinutes)}`}</Text> : null}
              <Btn label="Otra sesión" onPress={p.onReset} kind="ghost" />
            </>
          ) : null}
          {s.phase !== "done" ? (
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
              {measuring ? (s.mode === "timer" ? "Los minutos se suman a tu tiempo de hoy al terminar." : "Los minutos se suman a tu tiempo de hoy al terminar y cada 90 minutos.") : "Los minutos se suman a tu tiempo de hoy al terminar cada foco."}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Field({ label, value, onChange, numeric, invalid }: { label: string; value: string; onChange: (t: string) => void; numeric?: boolean; invalid?: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={onChange}
      keyboardType={numeric ? "number-pad" : "default"}
      style={[styles.input, { color: colors.text, borderColor: invalid ? colors.accent : colors.line, borderRadius: radius.md }]}
    />
  );
}

function Chip({ label, selected, onPress, a11y }: { label: string; selected: boolean; onPress: () => void; a11y?: string }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.surface : colors.bg }}
    >
      <Text style={{ color: colors.text, fontWeight: selected ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );
}

const Today = ({ minutes }: { minutes: number }): ReactNode =>
  minutes > 0 ? <Text style={{ fontSize: 16 }}>{`Hoy: ${formatDuration(minutes)}`}</Text> : null;

function IdlePanel({ prefs, preset, today, lines, onStart }: { prefs: PomodoroPrefs; preset: string | null; today: number; lines: string[]; onStart: Props["onStart"] }) {
  const { colors, radius, space } = useTheme();
  const [key, setKey] = useState<PomodoroPresetKey>(prefs.preset);
  const [focusMin, setFocusMin] = useState(String(prefs.config.focusMin));
  const [breakMin, setBreakMin] = useState(String(prefs.config.breakMin));
  const [cycles, setCycles] = useState(prefs.config.cycles ?? 4);
  const [unlimited, setUnlimited] = useState(prefs.config.cycles === null);
  const [topic, setTopic] = useState(prefs.topic);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: PomodoroPresetKey) => {
    setKey(next);
    setError(null);
    const pr = POMODORO_PRESETS.find((x) => x.key === next);
    if (pr) {
      setFocusMin(String(pr.focusMin));
      setBreakMin(String(pr.breakMin));
    }
  };
  const begin = () => {
    const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
    const config: PomodoroConfig = { focusMin: num(focusMin), breakMin: num(breakMin), cycles: unlimited ? null : cycles };
    const valid = validatePomodoroConfig(config);
    if (!valid.ok) return setError(valid.error);
    if (topic.length > 60) return setError(TOPIC_MAX_MESSAGE);
    setError(null);
    onStart(config, key, topic);
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {POMODORO_PRESETS.map((pr) => (
          <Chip key={pr.key} label={`${pr.focusMin}/${pr.breakMin}`} selected={key === pr.key} onPress={() => choose(pr.key)} />
        ))}
        <Chip label="Personalizado" selected={key === "custom"} onPress={() => choose("custom")} />
      </View>
      {key === "custom" ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Foco (min)" value={focusMin} onChange={setFocusMin} numeric />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Descanso (min)" value={breakMin} onChange={setBreakMin} numeric />
          </View>
        </View>
      ) : null}
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Text style={{ color: colors.text, fontSize: 14 }}>Rondas</Text>
        <View style={[styles.row, { alignItems: "center" }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Menos rondas" disabled={unlimited || cycles <= 1} onPress={() => setCycles((n) => Math.max(1, n - 1))} style={[styles.step, { borderColor: colors.line, borderRadius: radius.md }]}>
            <Text style={{ color: colors.text, fontSize: 18 }}>−</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 18, minWidth: 36, textAlign: "center" }}>{unlimited ? "∞" : cycles}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Más rondas" disabled={unlimited || cycles >= 12} onPress={() => setCycles((n) => Math.min(12, n + 1))} style={[styles.step, { borderColor: colors.line, borderRadius: radius.md }]}>
            <Text style={{ color: colors.text, fontSize: 18 }}>+</Text>
          </Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Sin límite" accessibilityState={{ checked: unlimited }} onPress={() => setUnlimited((v) => !v)}>
        <Text style={{ color: colors.text }}>{`${unlimited ? "☑" : "☐"} Sin límite`}</Text>
      </Pressable>
      <Field label="Tema" value={topic} onChange={setTopic} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{topicLabel(preset)}</Text>
      <Today minutes={today} />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 13 }}>{error}</Text> : null}
      {lines.map((l) => (
        <Text key={l} style={{ color: colors.text, fontSize: 13 }}>{l}</Text>
      ))}
      <Pressable accessibilityRole="button" onPress={begin} style={[styles.cta, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Empezar foco</Text>
      </Pressable>
    </View>
  );
}

function MeasureStart({ mode, prefs, preset, today, notice, onPick, onStart }: { mode: TimerMode; prefs: PomodoroPrefs; preset: string | null; today: number; notice: string[]; onPick: (m: number) => void; onStart: (topic: string) => void }) {
  const { colors, radius, space } = useTheme();
  const [custom, setCustom] = useState(mode === "timer" && !(TIMER_CHIPS as readonly number[]).includes(prefs.timerMin));
  const [text, setText] = useState(String(prefs.timerMin));
  const [minutes, setMinutes] = useState(prefs.timerMin);
  const [invalid, setInvalid] = useState(false);
  const [topic, setTopic] = useState(prefs.topic);
  const [error, setError] = useState<string | null>(null);

  const type = (value: string) => {
    setText(value);
    const t = value.trim();
    const n = /^\d+$/.test(t) ? Number(t) : Number.NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 90) {
      setInvalid(false);
      setMinutes(n);
      onPick(n);
    } else setInvalid(true);
  };
  const begin = () => {
    if (mode === "timer" && invalid) return;
    if (topic.length > 60) return setError(TOPIC_MAX_MESSAGE);
    setError(null);
    onStart(topic);
  };
  return (
    <View style={{ gap: space.md }}>
      {mode === "timer" ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Minutos</Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {TIMER_CHIPS.map((m) => (
              <Chip
                key={m}
                label={String(m)}
                a11y={`${m} minutos`}
                selected={!custom && minutes === m}
                onPress={() => {
                  setCustom(false);
                  setInvalid(false);
                  setText(String(m));
                  setMinutes(m);
                  onPick(m);
                }}
              />
            ))}
            <Chip label="Otro" selected={custom} onPress={() => { setCustom(true); setText(String(minutes)); }} />
          </View>
          {custom ? <Field label="Minutos (1 a 90)" value={text} onChange={type} numeric invalid={invalid} /> : null}
          {invalid ? <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 13 }}>{RANGE_MESSAGE}</Text> : null}
        </>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          {`Cuenta hacia arriba hasta que termines. Cada ${STOPWATCH_BLOCK_MIN} minutos se guarda un bloque y se detiene a las ${STOPWATCH_CAP_MIN / 60} horas.`}
        </Text>
      )}
      <Field label="Tema" value={topic} onChange={setTopic} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{topicLabel(preset)}</Text>
      <Today minutes={today} />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 13 }}>{error}</Text> : null}
      {notice.map((l) => (
        <Text key={l} style={{ color: colors.text, fontSize: 13 }}>{l}</Text>
      ))}
      <Pressable accessibilityRole="button" onPress={begin} style={[styles.cta, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Empezar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cta: { paddingVertical: 14, alignItems: "center" },
  row: { flexDirection: "row", gap: 8 },
  mode: { flex: 1, paddingVertical: 10, alignItems: "center" },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  step: { borderWidth: 1, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
