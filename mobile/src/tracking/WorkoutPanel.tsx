import { useState } from "react";
import { Text, View } from "react-native";
import { DAY_TYPES, DAY_TYPE_LABEL, MUSCLE_GROUPS, logSubtitle, parseKg, validateWorkoutDraft, type DayType, type ExerciseRef, type MuscleGroup, type WorkoutDraft } from "@/domain/logs";
import type { TodayRow } from "@/domain/today";
import { useTheme } from "../theme/ThemeProvider";
import { Chip, Chips, Cta, Field, Muted, NotFound, Outcome, Screen, Title, useAction, type ActionResult } from "./ui";

type Props = {
  row: TodayRow | null;
  exercises: ExerciseRef[];
  onSave: (draft: WorkoutDraft) => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  onCreateExercise: (input: { name: string; group: MuscleGroup }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onBack: () => void;
};

type SetText = { reps: string; kg: string };
type Picked = { exercise: ExerciseRef; sets: SetText[] };

const MAX_MATCHES = 6;
const norm = (t: string) => t.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Today's workout: day types, exercises (search or create) and their sets, saved on today's check-in. */
export function WorkoutPanel({ row, exercises, onSave, onDelete, onCreateExercise, onBack }: Props) {
  const { colors, space } = useTheme();
  const act = useAction();
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  if (!row) return <NotFound onBack={onBack} />;
  const today = row.log?.kind === "workout" ? row.log : null;

  const q = norm(query);
  const taken = new Set(picked.map((p) => p.exercise.id));
  const matches = q === "" ? [] : exercises.filter((e) => !taken.has(e.id) && norm(e.name).includes(q)).slice(0, MAX_MATCHES);
  const exact = exercises.some((e) => norm(e.name) === q);

  const toggleType = (t: DayType) => setDayTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const add = (exercise: ExerciseRef) => {
    setPicked((cur) => [...cur, { exercise, sets: [{ reps: "", kg: "" }] }]);
    setQuery("");
    setGroup(null);
  };
  const setField = (id: string, i: number, field: keyof SetText, value: string) =>
    setPicked((cur) => cur.map((p) => (p.exercise.id === id ? { ...p, sets: p.sets.map((s, j) => (j === i ? { ...s, [field]: value } : s)) } : p)));
  const addSet = (id: string) => setPicked((cur) => cur.map((p) => (p.exercise.id === id ? { ...p, sets: [...p.sets, { reps: "", kg: "" }] } : p)));
  const create = async () => {
    if (!group) return act.fail("Elige un grupo muscular.");
    const r = await onCreateExercise({ name: query, group });
    if (!r.ok) return act.fail(r.error);
    act.clear();
    add({ id: r.id, name: query.trim(), group });
  };
  const save = () => {
    const draft: WorkoutDraft = {
      dayTypes,
      exercises: picked.map((p) => ({
        exerciseId: p.exercise.id,
        // a bad number stays NaN so the shared validation answers with its own copy
        sets: p.sets.map((s) => ({ reps: /^\d+$/.test(s.reps.trim()) ? Number(s.reps) : Number.NaN, kg: parseKg(s.kg) ?? Number.NaN })),
      })),
    };
    const valid = validateWorkoutDraft(draft);
    if (!valid.ok) return act.fail(valid.error);
    void act.run(() => onSave(draft));
  };

  return (
    <Screen onBack={onBack}>
      <Title>{row.name}</Title>
      <Muted>{today ? logSubtitle(today) : "Hoy aún no registras entrenamiento"}</Muted>
      <Chips>
        {DAY_TYPES.map((t) => (
          <Chip key={t} label={DAY_TYPE_LABEL[t]} accessibilityLabel={`Tipo de día ${DAY_TYPE_LABEL[t]}`} selected={dayTypes.includes(t)} onPress={() => { toggleType(t); act.clear(); }} />
        ))}
      </Chips>
      {picked.map(({ exercise, sets }) => (
        <View key={exercise.id} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", flex: 1 }}>{exercise.name}</Text>
            <Chip label="Quitar" accessibilityLabel={`Quitar ${exercise.name}`} onPress={() => setPicked((cur) => cur.filter((p) => p.exercise.id !== exercise.id))} />
          </View>
          {sets.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field label={`Repeticiones serie ${i + 1} de ${exercise.name}`} value={s.reps} onChangeText={(t) => setField(exercise.id, i, "reps", t)} keyboardType="number-pad" placeholder="Reps" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={`Peso serie ${i + 1} de ${exercise.name}`} value={s.kg} onChangeText={(t) => setField(exercise.id, i, "kg", t)} keyboardType="decimal-pad" placeholder="kg" />
              </View>
            </View>
          ))}
          <Cta label="Agregar serie" accessibilityLabel={`Agregar serie a ${exercise.name}`} onPress={() => addSet(exercise.id)} />
        </View>
      ))}
      <Field label="Buscar ejercicio" value={query} onChangeText={setQuery} />
      {matches.map((e) => (
        <Cta key={e.id} label={e.name} accessibilityLabel={`Agregar ${e.name}`} onPress={() => add(e)} />
      ))}
      {q !== "" && !exact ? (
        <View style={{ gap: space.sm }}>
          <Chips>
            {MUSCLE_GROUPS.map((g) => (
              <Chip key={g} label={DAY_TYPE_LABEL[g]} accessibilityLabel={`Grupo ${DAY_TYPE_LABEL[g]}`} selected={group === g} onPress={() => setGroup(g)} />
            ))}
          </Chips>
          <Cta label="Crear ejercicio" onPress={() => void create()} />
        </View>
      ) : null}
      <Cta label="Guardar entrenamiento" primary disabled={act.busy} onPress={save} />
      <Outcome error={act.error} done={act.done} />
      {today ? <Cta label="Quitar entrenamiento" disabled={act.busy} onPress={() => void act.run(onDelete)} /> : null}
    </Screen>
  );
}
