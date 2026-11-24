import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCachedToday } from "../../../../src/data/use-cached-today";
import { takeAndSendPhoto } from "../../../../src/photo/capture";
import { deviceCapture } from "../../../../src/photo/device";
import { PhotoPanel } from "../../../../src/photo/PhotoPanel";

/** registros/[habitId]/photo?itemId=: the proof photo of a habit, or of one of its steps (online only). */
export default function PhotoScreen() {
  const { habitId, itemId } = useLocalSearchParams<{ habitId: string; itemId?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { userId, view } = useCachedToday();
  const row = view?.rows.find((r) => r.id === habitId) ?? null;
  const itemLabel = itemId ? (row?.items.find((i) => i.id === itemId)?.label ?? null) : null;
  return (
    <PhotoPanel
      row={row}
      itemLabel={itemLabel}
      onBack={() => router.back()}
      onTake={async () => {
        const r = await takeAndSendPhoto(itemId ? { itemId } : { habitId }, deviceCapture);
        // the photo made (or completed) the check-in on the server: Hoy re-reads it
        if (r.status === "sent") await qc.invalidateQueries({ queryKey: ["today", userId] });
        return r;
      }}
    />
  );
}
