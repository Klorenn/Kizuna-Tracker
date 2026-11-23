import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { dayHeading } from "@/domain/calendar";
import { localDate } from "@/domain/dates";
import { logDateParam } from "@/lib/log-date";
import { loadPickerBooks } from "@/lib/reading-books";
import { read } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { LecturaEditor } from "./LecturaEditor";

export const metadata: Metadata = { title: "Lectura" };

/**
 * Add, edit or delete the reading of one day (`?fecha=YYYY-MM-DD`; missing, malformed or future →
 * today in the profile's zone). A reading lives on that day's check-in: without one there is nothing
 * to log (past check-ins cannot be created).
 */
export default async function LecturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string | string[] }>;
}) {
  const [{ id }, { fecha }] = await Promise.all([params, searchParams]);
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const [profile, habitRes] = await Promise.all([
    getViewerProfile(),
    supabase.from("habits").select("id,name,log_type").eq("id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile) redirect("/login?error=perfil");
  const habit = read(habitRes);
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const date = logDateParam(fecha, today);
  // rejected check-ins keep their logs too: the log is your data
  const checkin = read(await supabase
    .from("checkins")
    .select("id")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", date)
    .maybeSingle());
  const { data: entry } = checkin
    ? await supabase
        .from("reading_entries")
        .select("book_id,from_page,to_page")
        .eq("checkin_id", checkin.id)
        .maybeSingle()
    : { data: null };
  const isReading = habit.log_type === "reading";
  // the log type changed after logging: the old reading still shows, so it can be fixed or deleted
  const leftover = !isReading && entry !== null;
  const books = checkin && (isReading || leftover) ? await loadPickerBooks(supabase, user.id, entry?.book_id) : [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-semibold text-ink">Lectura</h1>
        <p className="text-small text-muted">
          {habit.name} · {dayHeading(date, today)}
        </p>
      </div>
      {!isReading && !leftover ? (
        <Card>
          <EmptyState
            title="Este hábito no lleva lectura"
            body="Elige Lectura en Registro detallado para anotar libros y páginas."
            action={
              <ButtonLink href={`/habitos/${id}/editar`} variant="secondary" className="w-auto!">
                Editar hábito
              </ButtonLink>
            }
          />
        </Card>
      ) : !checkin ? (
        <Card>
          <EmptyState
            title="Ese día no tiene check-in"
            body="Los registros se guardan sobre un día cumplido."
          />
        </Card>
      ) : (
        <>
          {leftover ? (
            <p className="text-small text-pretty text-muted">
              Este hábito ya no lleva lectura. Puedes borrar la que quedó de ese día.
            </p>
          ) : null}
          <LecturaEditor
          key={`${checkin.id}:${entry ? `${entry.book_id}:${entry.from_page}:${entry.to_page}` : "none"}`}
          checkinId={checkin.id}
          books={books}
          entry={entry ? { bookId: entry.book_id, fromPage: entry.from_page, toPage: entry.to_page } : null}
          />
        </>
      )}
    </main>
  );
}
