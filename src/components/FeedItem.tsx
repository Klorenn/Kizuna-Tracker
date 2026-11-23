import { HabitIcon } from "./habit-icon";
import type { IconKey } from "@/domain/presets";

export type FeedEntry = {
  id: string;
  who: string;
  habit: string;
  icon: string;
  when: string;
  /** Signed URL (300 s) of the proof photo, when the check-in has one and it is visible. */
  photoUrl: string | null;
  note: string | null;
};

/** Friend check-in: photo card (ImageCard) or a compact post row. */
export function FeedItem({ entry }: { entry: FeedEntry }) {
  if (entry.photoUrl) {
    return (
      <article className="relative flex h-[220px] flex-col justify-end gap-[2px] overflow-hidden rounded-lg border border-line bg-media p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img src={entry.photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-media/75"
        />
        <p className="relative text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-on-media">
          {entry.who} · {entry.habit}
        </p>
        <p className="relative text-small text-on-media">
          {entry.when}
          {entry.note ? ` · ${entry.note}` : ""}
        </p>
      </article>
    );
  }
  return (
    <article className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-field text-ink">
        <HabitIcon name={entry.icon as IconKey} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="truncate text-body font-medium text-ink">
          {entry.who} · {entry.habit}
        </p>
        {entry.note ? <p className="truncate text-small text-muted">{entry.note}</p> : null}
      </div>
      <p className="shrink-0 text-small text-muted">{entry.when}</p>
    </article>
  );
}
