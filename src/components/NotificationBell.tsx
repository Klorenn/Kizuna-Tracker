import { Bell } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";

function BellLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/notificaciones"
      aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent text-ink hover:bg-accent-soft"
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

async function BellInner() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return <BellLink unread={count ?? 0} />;
}

/**
 * Circular bell with an unread dot; links to /notificaciones. The count streams in after the
 * page shell, so the bell never adds a round trip to the page's first byte.
 */
export function NotificationBell() {
  return (
    <Suspense fallback={<BellLink unread={0} />}>
      <BellInner />
    </Suspense>
  );
}
