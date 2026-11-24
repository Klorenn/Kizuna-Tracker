import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { loadPickerBooks } from "@/lib/reading-books";
import { supabase } from "../../../../src/lib/supabase";
import { ReadingPanel } from "../../../../src/tracking/ReadingPanel";
import { useLogActions } from "../../../../src/tracking/use-log-actions";

/** registros/[habitId]/reading: today's reading of one habit (online write; checks the habit in with it). */
export default function ReadingScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, row, actions } = useLogActions(habitId);
  const books = useQuery({ queryKey: ["log", userId, "books"], queryFn: () => loadPickerBooks(supabase(), userId), enabled: userId !== "" });
  return <ReadingPanel row={row} books={books.data ?? []} {...actions.reading} onBack={() => router.back()} />;
}
