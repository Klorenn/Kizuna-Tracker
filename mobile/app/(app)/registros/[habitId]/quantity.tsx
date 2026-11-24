import { useLocalSearchParams, useRouter } from "expo-router";
import { useCachedToday } from "../../../../src/data/use-cached-today";
import { useTrack } from "../../../../src/data/use-track";
import { QuantityPanel } from "../../../../src/tracking/QuantityPanel";

/** registros/[habitId]/quantity: today's sums of one quantity habit (optimistic, queued offline). */
export default function QuantityScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, view } = useCachedToday();
  const track = useTrack(userId, view);
  const row = view?.rows.find((r) => r.id === habitId) ?? null;
  return <QuantityPanel row={row} onAdd={(amount) => track.addQuantity(habitId, amount)} onRemove={track.removeQuantity} onBack={() => router.back()} />;
}
