import { TZDate } from "@date-fns/tz";
import { Bell, CaretLeft, Receipt, Trophy, Users, Warning } from "@phosphor-icons/react/dist/ssr";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarkReadButton } from "@/components/MarkReadButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

import { addDays, localDate } from "@/domain/dates";
import { notificationView } from "@/lib/notification-copy";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";

export const metadata: Metadata = { title: "Notificaciones" };

const ICONS = {
  friend_request: Users,
  challenge_proposed: Trophy,
  photo_rejected: Warning,
  new_debt: Receipt,
  reminder: Bell,
} as const;

type Row = { id: string; type: string; payload: unknown; read_at: string | null; created_at: string };

export default async function NotificacionesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const supabase = await createServerClient();
  const tz = viewer.timezone;

  const { data } = await supabase
    .from("notifications")
    .select("id,type,payload,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  const rows: Row[] = data ?? [];

  const today = localDate(new Date(), tz);
  const weekAgo = addDays(today, -6);
  const groups = [
    { label: "Hoy", items: rows.filter((r) => localDate(new Date(r.created_at), tz) === today) },
    {
      label: "Esta semana",
      items: rows.filter((r) => {
        const d = localDate(new Date(r.created_at), tz);
        return d < today && d >= weekAgo;
      }),
    },
    { label: "Antes", items: rows.filter((r) => localDate(new Date(r.created_at), tz) < weekAgo) },
  ].filter((g) => g.items.length > 0);
  const hasUnread = rows.some((r) => !r.read_at);

  const when = (iso: string, group: string) => {
    const d = new TZDate(new Date(iso), tz);
    return format(d, group === "Hoy" ? "HH:mm" : group === "Esta semana" ? "EEE" : "d MMM", { locale: es });
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <Link href="/" className="inline-flex h-11 items-center gap-1 self-start text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Hoy
      </Link>
      <h1 className="text-display font-semibold text-ink">Notificaciones</h1>
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="Todo al día" body="Aquí verás solicitudes, retos, deudas y recordatorios." />
        </Card>
      ) : (
        groups.map((g, i) => (
          <section key={g.label} className="flex flex-col gap-4">
            <div className="section-label flex h-6 items-center gap-2">
              <p className="min-w-0 flex-1 text-muted">{g.label}</p>
              {i === 0 && hasUnread ? <MarkReadButton /> : null}
            </div>
            <Card className="px-4 py-1">
              <ul>
                {g.items.map((r) => {
                  const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
                  const view = notificationView(r.type, payload);
                  const Icon = ICONS[r.type as keyof typeof ICONS] ?? Bell;
                  return (
                    <li key={r.id} className="border-line [&:not(:last-child)]:border-b">
                      <Link href={view.url} className="flex items-start gap-3 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-field text-ink">
                          <Icon size={20} weight="light" aria-hidden />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={`text-body text-ink ${r.read_at ? "" : "font-medium"}`}>{view.title}</span>
                          <span className="text-small text-muted">{view.body}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5 text-small text-muted">
                          {when(r.created_at, g.label)}
                          {r.read_at ? null : (
                            <span aria-label="Sin leer" className="size-2 rounded-full bg-accent" />
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
    </main>
  );
}
