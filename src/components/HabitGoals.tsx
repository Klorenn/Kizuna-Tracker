import { GoalCard } from "@/components/GoalCard";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GoalsResult } from "@/lib/goals-data";

/**
 * The "Meta" block of a habit's page. A failed read is a retry line, never goal cards with zero
 * progress; no goals at all renders nothing.
 */
export function HabitGoals({ result, retryHref }: { result: GoalsResult; retryHref: string }) {
  if (!result.ok) {
    return (
      <>
        <SectionHeader label="Meta" action="Ver metas" href="/metas" />
        <LoadFailed href={retryHref} />
      </>
    );
  }
  if (result.goals.length === 0) return null;
  return (
    <>
      <SectionHeader label="Meta" action="Ver metas" href="/metas" />
      <Card accent className="divide-y divide-line py-1 pl-[19px] pr-4">
        {result.goals.map((g) => (
          <GoalCard key={g.id} goal={g} archivable={false} />
        ))}
      </Card>
    </>
  );
}
