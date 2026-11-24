import { useState } from "react";
import { Text, View } from "react-native";
import { logSubtitle } from "@/domain/logs";
import type { TodayRow } from "@/domain/today";
import type { MediaInput, MediaItem, MediaKind } from "@/domain/watch";
import { checkWatchShape, type WatchInput } from "@/lib/watch-copy";
import { useTheme } from "../theme/ThemeProvider";
import { Chip, Chips, Cta, Field, Muted, NotFound, Outcome, Screen, Title, Toggle, intOf, useAction, type ActionResult } from "./ui";

type Props = {
  row: TodayRow | null;
  media: MediaItem[];
  onSave: (entry: WatchInput) => Promise<ActionResult>;
  /** checks the habit in with nothing watched */
  onMark: () => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  onCreateMedia: (input: MediaInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onBack: () => void;
};

/** What you watched today: pick a title, episodes and season (series) or minutes / completa (movie), "Terminé". */
export function WatchPanel({ row, media, onSave, onMark, onDelete, onCreateMedia, onBack }: Props) {
  const { colors, space } = useTheme();
  const act = useAction();
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState("");
  const [season, setSeason] = useState("");
  const [episodeTo, setEpisodeTo] = useState("");
  const [minutes, setMinutes] = useState("");
  const [completed, setCompleted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [title, setTitle] = useState("");
  const [newKind, setNewKind] = useState<MediaKind>("series");
  if (!row) return <NotFound onBack={onBack} />;
  const today = row.log?.kind === "watch" ? row.log : null;
  // before a pick: the first title you are watching (the list may still be loading on first render)
  const item = media.find((m) => m.id === mediaId) ?? media.find((m) => m.status === "watching") ?? media[0] ?? null;

  const save = () => {
    if (!item) return act.fail("Agrega un título para registrar lo que ves.");
    const series = item.kind === "series";
    const num = (raw: string) => (raw.trim() === "" ? null : (intOf(raw) ?? -1));
    const entry: WatchInput = {
      mediaId: item.id,
      episodes: series ? num(episodes) : null,
      season: series ? num(season) : null,
      episodeTo: series ? num(episodeTo) : null,
      minutes: num(minutes),
      completed: !series && completed,
      finished,
    };
    // the series shape needs episodes; the movie shape needs minutes or Completa
    const shape = series && entry.episodes === null ? ({ ok: false, error: "Indica cuántos episodios viste." } as const) : checkWatchShape(entry);
    if (!shape.ok) return act.fail(shape.error);
    void act.run(() => onSave(entry));
  };
  const addTitle = async () => {
    const r = await onCreateMedia({ title, kind: newKind, totalSeasons: null, totalEpisodes: null, runtimeMin: null });
    if (!r.ok) return act.fail(r.error);
    act.clear();
    setTitle("");
    setMediaId(r.id);
  };

  return (
    <Screen onBack={onBack}>
      <Title>{row.name}</Title>
      <Muted>{today ? logSubtitle(today) : "Hoy aún no registras lo que viste"}</Muted>
      {media.length === 0 ? (
        <Text style={{ color: colors.text, fontSize: 15 }}>Agrega un título para registrar lo que ves.</Text>
      ) : (
        <Chips>
          {media.map((m) => (
            <Chip key={m.id} label={m.title} accessibilityLabel={`Título ${m.title}`} selected={m.id === item?.id} onPress={() => { setMediaId(m.id); act.clear(); }} />
          ))}
        </Chips>
      )}
      <View style={{ gap: space.sm }}>
        <Field label="Título nuevo" value={title} onChangeText={setTitle} />
        <Chips>
          <Chip label="Serie" accessibilityLabel="Es una serie" selected={newKind === "series"} onPress={() => setNewKind("series")} />
          <Chip label="Película" accessibilityLabel="Es una película" selected={newKind === "movie"} onPress={() => setNewKind("movie")} />
        </Chips>
        <Cta label="Agregar título" onPress={() => void addTitle()} />
      </View>
      {item?.kind === "series" ? (
        <>
          <Field label="Episodios" value={episodes} onChangeText={setEpisodes} keyboardType="number-pad" />
          <Field label="Temporada" value={season} onChangeText={setSeason} keyboardType="number-pad" placeholder="Temporada (opcional)" />
          <Field label="Hasta el episodio" value={episodeTo} onChangeText={setEpisodeTo} keyboardType="number-pad" placeholder="Hasta el episodio (opcional)" />
        </>
      ) : null}
      {item?.kind === "movie" ? (
        <>
          <Field label="Minutos" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
          <Toggle label="La vi completa" value={completed} onChange={setCompleted} />
        </>
      ) : null}
      {item ? (
        <>
          <Toggle label="Terminé el título" value={finished} onChange={setFinished} />
          <Cta label="Guardar" primary disabled={act.busy} onPress={save} />
        </>
      ) : null}
      <Outcome error={act.error} done={act.done} />
      <Cta label="Solo marcar" disabled={act.busy} onPress={() => void act.run(onMark)} />
      {today ? <Cta label="Quitar lo visto" disabled={act.busy} onPress={() => void act.run(onDelete)} /> : null}
    </Screen>
  );
}
