import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";

export type PersonRowData = {
  username: string;
  displayName: string;
  avatarSrc: string | null;
  avatarPreset: number | null;
  mutualCount?: number;
  isNew?: boolean;
};

/** "1 amigo en común" / "N amigos en común", else "Nuevo en Kizuna", else nothing. Never who the friends are. */
export function metaLine({ mutualCount = 0, isNew = false }: { mutualCount?: number; isNew?: boolean }): string | null {
  if (mutualCount > 0) return mutualCount === 1 ? "1 amigo en común" : `${mutualCount} amigos en común`;
  return isNew ? "Nuevo en Kizuna" : null;
}

/**
 * A person in a list: avatar, name, @usuario (mono), one meta line and one action slot. The row
 * opens /@usuario; the action sits beside the link, never inside it. The meta line is always
 * reserved (`showMeta`), so a row keeps its height whether it has something to say or not.
 */
export function PersonRow({
  person,
  action,
  notice = null,
  showMeta = true,
}: {
  person: PersonRowData;
  action: ReactNode;
  /** A message under the row (an error), full width so it never squeezes the action slot. */
  notice?: ReactNode;
  showMeta?: boolean;
}) {
  const meta = showMeta ? metaLine(person) : null;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={person.displayName} src={person.avatarSrc} preset={person.avatarPreset} />
        <Link
          href={`/@${person.username}`}
          className="flex min-h-11 min-w-0 flex-1 items-center rounded-md focus-visible:outline-offset-[-2px]"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-body font-medium text-ink">{person.displayName}</span>
            <span className="truncate font-mono text-small text-muted">@{person.username}</span>
            {showMeta ? (
              <span data-meta className="block min-h-5 truncate text-small text-muted">
                {meta}
              </span>
            ) : null}
          </span>
        </Link>
        <div className="flex w-28 shrink-0 justify-end">{action}</div>
      </div>
      {notice}
    </div>
  );
}
