import { useState } from "react";
import { Text, View } from "react-native";
import { CARDIO_KINDS, CARDIO_KIND_LABEL, formatDistance, parseDistance, parseHms, type CardioKind } from "@/domain/cardio";
import { formatDuration } from "@/domain/time";
import { cardioSummary } from "@/domain/cardio";
import type { TodayRow } from "@/domain/today";
import { checkCardio, type CardioInput } from "@/lib/cardio-copy";
import type { CardioRecent } from "@/lib/logs-rpc";
import { useTheme } from "../theme/ThemeProvider";
import { Chip, Chips, Cta, Field, Muted, NotFound, Outcome, Screen, Title, useAction, type ActionResult } from "./ui";

type Props = {
  row: TodayRow | null;
  outings: CardioRecent[];
  onSave: (entry: CardioInput) => Promise<ActionResult>;
  onUpdate: (id: string, entry: CardioInput) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  /** checks the habit in with no outing */
  onMark: () => Promise<ActionResult>;
  onBack: () => void;
};

/** Distance outings of one habit: activity, distance (km, metres for swimming), time, effort and note. */
export function CardioPanel({ row, outings, onSave, onUpdate, onDelete, onMark, onBack }: Props) {
  const { colors, space } = useTheme();
  const act = useAction();
  const [kind, setKind] = useState<CardioKind>("run");
  const [distance, setDistance] = useState("");
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [s, setS] = useState("");
  const [effort, setEffort] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  if (!row) return <NotFound onBack={onBack} />;
  const today = row.log?.kind === "cardio" ? row.log : null;

  const entry = (): CardioInput => ({
    kind,
    distanceM: parseDistance(distance, kind) ?? 0,
    durationS: parseHms(h, m, s) ?? 0,
    effort,
    note: note.trim() === "" ? null : note,
  });
  const submit = () => {
    const draft = entry();
    const valid = checkCardio(draft);
    if (!valid.ok) return act.fail(valid.error);
    const e = { ...draft, note: valid.note };
    const id = editing;
    void act.run(async () => {
      const r = id ? await onUpdate(id, e) : await onSave(e);
      if (r.ok) {
        setEditing(null);
        setDistance("");
        setH("");
        setM("");
        setS("");
        setEffort(null);
        setNote("");
      }
      return r;
    });
  };
  const edit = (o: CardioRecent) => {
    setEditing(o.id);
    setKind(o.kind);
    setDistance(o.kind === "swim" ? String(o.distanceM) : String(o.distanceM / 1000).replace(".", ","));
    setH(String(Math.floor(o.durationS / 3600) || ""));
    setM(String(Math.floor((o.durationS % 3600) / 60) || ""));
    setS(String(o.durationS % 60 || ""));
    act.clear();
  };

  return (
    <Screen onBack={onBack}>
      <Title>{row.name}</Title>
      <Muted>{today ? cardioSummary(today.entries) : "Hoy aún no registras salidas"}</Muted>
      {outings.map((o, i) => (
        <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{`${CARDIO_KIND_LABEL[o.kind]} · ${formatDistance(o.distanceM, o.kind)} · ${formatDuration(Math.round(o.durationS / 60))}`}</Text>
          <Chip label="Editar" accessibilityLabel={`Editar salida ${i + 1}`} onPress={() => edit(o)} />
          <Chip label="Quitar" accessibilityLabel={`Quitar salida ${i + 1}`} onPress={() => void act.run(() => onDelete(o.id))} />
        </View>
      ))}
      <Chips>
        {CARDIO_KINDS.map((k) => (
          <Chip key={k} label={CARDIO_KIND_LABEL[k]} accessibilityLabel={`Actividad ${CARDIO_KIND_LABEL[k]}`} selected={k === kind} onPress={() => setKind(k)} />
        ))}
      </Chips>
      <Field label="Distancia" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder={kind === "swim" ? "Distancia (m)" : "Distancia (km)"} />
      <Field label="Horas" value={h} onChangeText={setH} keyboardType="number-pad" />
      <Field label="Minutos" value={m} onChangeText={setM} keyboardType="number-pad" />
      <Field label="Segundos" value={s} onChangeText={setS} keyboardType="number-pad" />
      <Chips>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip key={n} label={String(n)} accessibilityLabel={`Esfuerzo ${n}`} selected={effort === n} onPress={() => setEffort(effort === n ? null : n)} />
        ))}
      </Chips>
      <Field label="Nota" value={note} onChangeText={setNote} placeholder="Nota (opcional)" />
      <Cta label={editing ? "Actualizar salida" : "Guardar salida"} primary disabled={act.busy} onPress={submit} />
      <Outcome error={act.error} done={act.done} />
      <Cta label="Solo marcar" disabled={act.busy} onPress={() => void act.run(onMark)} />
    </Screen>
  );
}
