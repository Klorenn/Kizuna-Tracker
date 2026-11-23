import { Warning } from "@phosphor-icons/react";
import { HabitIcon } from "@/components/habit-icon";
import { toHabitColor } from "@/domain/habit-colors";
import { toGroupIcon } from "./format";

/** Text with its numbers in the mono face. */
export function NumText({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\d+)/).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Error text in ink with the alert icon (the app's error line). */
export function ErrorLine({ message, id }: { message: string; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-small text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {message}
    </p>
  );
}

/** The group's icon on its identity colour (habit tokens, never a fixed hue). */
export function GroupIconTile({ icon, color, large = false }: { icon: string; color: string; large?: boolean }) {
  return (
    <span
      data-habit-color={toHabitColor(color)}
      className={`flex shrink-0 items-center justify-center rounded-full bg-(--habit-soft) text-ink ${
        large ? "size-14" : "size-11"
      }`}
    >
      <HabitIcon name={toGroupIcon(icon)} size={large ? 28 : 22} />
    </span>
  );
}
