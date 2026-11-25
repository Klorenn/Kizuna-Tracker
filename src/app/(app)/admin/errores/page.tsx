import { notFound } from "next/navigation";
import { groupErrors, isAdminUser, type ErrorRowView } from "@/lib/client-errors/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Errores", robots: { index: false, follow: false } };

const DAYS = 7;
const MAX_ROWS = 2000;

/** Owner-only: ADMIN_USER_IDS (server env, set in Vercel). Anyone else, signed in or not, gets the 404. */
export default async function ErroresPage() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!isAdminUser(data?.user?.id, process.env.ADMIN_USER_IDS)) notFound();

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await createAdminClient()
    .from("client_errors")
    .select("fingerprint, kind, message, stack, url_path, ua_kind, release, count, last_seen_at")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(MAX_ROWS);
  const groups = groupErrors((rows ?? []) as ErrorRowView[]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-title text-ink">Errores, últimos {DAYS} días</h1>
      {error ? <p className="mt-4 text-body text-ink">No se pudieron leer los errores.</p> : null}
      {!error && groups.length === 0 ? <p className="mt-4 text-body text-ink">Sin errores.</p> : null}
      <ul className="mt-4 flex flex-col gap-3">
        {groups.map((g) => (
          <li key={g.fingerprint} className="rounded-xl border border-line p-3">
            <details>
              <summary className="cursor-pointer text-body text-ink">
                <span className="font-semibold">{g.count}×</span> <span className="break-words">{g.message.slice(0, 160)}</span>
              </summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption text-ink">
                <dt>Tipo</dt><dd>{g.kind === "server" ? "server (reportado por el cliente, no verificado)" : g.kind}</dd>
                <dt>Última vez</dt><dd>{new Date(g.lastSeen).toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
                <dt>Ruta</dt><dd className="break-all">{g.path}</dd>
                <dt>Cliente</dt><dd>{g.uaKind}</dd>
                <dt>Release</dt><dd>{g.release ?? "-"}</dd>
                <dt>Huella</dt><dd className="break-all font-mono">{g.fingerprint}</dd>
              </dl>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption text-ink">{g.stack ?? "(sin stack)"}</pre>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
