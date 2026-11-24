import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { localDate } from "@/domain/dates";
import { pagesRead } from "@/domain/logs";
import { fetchAll } from "@/lib/paginate";
import { readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { LibrosView, type BookView } from "./LibrosView";

export const metadata: Metadata = { title: "Libros" };

export default async function LibrosPage() {
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const profile = await getViewerProfile();
  if (!profile) redirect("/login?error=perfil");

  const [books, entries] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,author,total_pages,status,finished_on,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
    // one reading per check-in: a few thousand rows over years, read page by page
    fetchAll((from, to) =>
      supabase
        .from("reading_entries")
        .select("id,book_id,local_date,from_page,to_page")
        .eq("user_id", user.id)
        .order("local_date")
        .order("id")
        .range(from, to),
    ),
  ]);

  const progressByBook = new Map<string, { pages: number; readings: number; latestDate: string; currentPage: number }>();
  for (const entry of entries) {
    const progress = progressByBook.get(entry.book_id);
    if (progress) {
      progress.pages += pagesRead({ fromPage: entry.from_page, toPage: entry.to_page });
      progress.readings += 1;
      if (entry.local_date > progress.latestDate || (entry.local_date === progress.latestDate && entry.to_page > progress.currentPage)) {
        progress.latestDate = entry.local_date;
        progress.currentPage = entry.to_page;
      }
    } else {
      progressByBook.set(entry.book_id, {
        pages: pagesRead({ fromPage: entry.from_page, toPage: entry.to_page }),
        readings: 1,
        latestDate: entry.local_date,
        currentPage: entry.to_page,
      });
    }
  }
  const view: BookView[] = readRows(books).map((b) => {
    const progress = progressByBook.get(b.id);
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      totalPages: b.total_pages,
      status: b.status === "finished" ? "finished" : "reading",
      finishedOn: b.finished_on,
      currentPage: progress?.currentPage ?? 0,
      readings: progress?.readings ?? 0,
      pages: progress?.pages ?? 0,
    };
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref="/" />
      <h1 className="text-display font-semibold text-ink">Libros</h1>
      <LibrosView books={view} today={localDate(new Date(), profile.timezone)} />
    </main>
  );
}
