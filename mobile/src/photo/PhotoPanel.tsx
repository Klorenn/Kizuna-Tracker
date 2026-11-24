import { useRef, useState } from "react";
import { Text } from "react-native";
import type { TodayRow } from "@/domain/today";
import { Cta, Muted, NotFound, Screen, Title } from "../tracking/ui";
import { useTheme } from "../theme/ThemeProvider";
import type { CaptureOutcome } from "./capture";

type Props = {
  row: TodayRow | null;
  /** the step being photographed, when the photo is for a step and not for the habit */
  itemLabel: string | null;
  onTake: () => Promise<CaptureOutcome>;
  onBack: () => void;
};

type State = { kind: "idle" } | { kind: "busy" } | { kind: "sent"; dayCompleted: boolean } | { kind: "error"; error: string };

/** The proof photo of a habit or one of its steps: camera, compress, send. Online only: nothing is queued. */
export function PhotoPanel({ row, itemLabel, onTake, onBack }: Props) {
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ kind: "idle" });
  const live = useRef(false);
  if (!row) return <NotFound onBack={onBack} />;

  const take = async () => {
    if (live.current) return;
    live.current = true;
    setState({ kind: "busy" });
    try {
      const r = await onTake();
      if (r.status === "sent") setState({ kind: "sent", dayCompleted: r.dayCompleted });
      else if (r.status === "error") setState({ kind: "error", error: r.error });
      else setState({ kind: "idle" });
    } finally {
      live.current = false;
    }
  };

  return (
    <Screen onBack={onBack}>
      <Title>{itemLabel ?? row.name}</Title>
      {itemLabel ? <Muted>{row.name}</Muted> : null}
      {state.kind === "sent" ? (
        <>
          <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "600" }}>Foto enviada</Text>
          {state.dayCompleted ? <Text style={{ color: colors.text, fontSize: 15 }}>Completaste el día.</Text> : null}
        </>
      ) : (
        <>
          <Muted>Este registro pide una foto de prueba.</Muted>
          {state.kind === "error" ? <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 14 }}>{state.error}</Text> : null}
          <Cta label={state.kind === "busy" ? "Enviando…" : "Tomar foto"} primary disabled={false} onPress={() => void take()} />
        </>
      )}
    </Screen>
  );
}
