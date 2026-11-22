import { Bell } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

/** Circular bell with an unread dot; links to /notificaciones. */
export async function NotificationBell() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  const unread = count ?? 0;
  return (
    <Link
      href="/notificaciones"
      aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
      className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent text-ink hover:bg-accent-soft"
    >
      <Bell size={20} weight="light" aria-hidden />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-paper bg-accent"
        />
      ) : null}
    </Link>
  );
}
