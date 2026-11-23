import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Card } from "@/components/ui/Card";
import { LONG_QUERY_COPY, PAGE_SIZE, SHORT_QUERY_COPY, loadPeople, normalizeQuery } from "@/lib/discover-data";
import { getSessionUser } from "@/lib/viewer";
import { PeopleSearch } from "../PeopleSearch";
import { ExploreList } from "./ExploreList";

export const metadata: Metadata = { title: "Explorar" };

export default async function ExplorarPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ : "";
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");

  const check = normalizeQuery(q);
  // one character runs nothing; the page says so instead
  const result =
    check.kind === "none" || check.kind === "ok"
      ? await loadPeople({ query: check.kind === "ok" ? check.q : null, offset: 0, limit: PAGE_SIZE })
      : null;
  const query = check.kind === "ok" ? check.q : null;
  const here = query ? `/amigos/explorar?q=${encodeURIComponent(q)}` : "/amigos/explorar";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <div className="flex flex-col gap-1">
        <Link href="/amigos" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-body text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Amigos
        </Link>
        <h1 className="text-display font-semibold text-ink">Explorar</h1>
      </div>

      <PeopleSearch defaultValue={q} />

      {check.kind === "short" || check.kind === "long" ? (
        <p role="status" className="text-body text-muted">
          {check.kind === "short" ? SHORT_QUERY_COPY : LONG_QUERY_COPY}
        </p>
      ) : result && !result.ok ? (
        <LoadFailed href={here} />
      ) : result && result.people.length === 0 ? (
        query ? (
          <p role="status" className="text-body text-muted">
            Nadie coincide con esa búsqueda.
          </p>
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-body text-muted">Todavía no hay más personas por aquí. Invita a alguien con tu enlace.</p>
            <ShareProfileButton kind="invite" label="Invitar" />
          </Card>
        )
      ) : result ? (
        <ExploreList key={query ?? ""} query={query} initial={result.people} initialHasMore={result.hasMore} />
      ) : null}
    </main>
  );
}
