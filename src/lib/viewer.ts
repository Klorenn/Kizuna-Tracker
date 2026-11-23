import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };
export type Viewer = { id: string; timezone: string; deletedAt: string | null };
/** Everything the adopted pages read from the viewer's own profile row, in the one read. */
export type ViewerProfile = Viewer & {
  username: string;
  firstName: string;
  lastName: string;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
  avatarPreset: number | null;
  timezoneChangedAt: string | null;
  reminderTime: string;
};

type Client = Awaited<ReturnType<typeof createServerClient>>;

const PROFILE_COLUMNS =
  "id,timezone,deleted_at,username,first_name,last_name,avatar_path,avatar_updated_at,avatar_preset,timezone_changed_at,reminder_time";

/**
 * The verified user of this request, from the JWT claims. With asymmetric signing keys that is a
 * local check; with the legacy HS256 secret auth-js makes the same /user call getUser() made.
 * Anything it cannot verify, including a throw on a malformed token, counts as signed out.
 */
export async function loadSessionUser(supabase: Client): Promise<SessionUser | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    if (!id) return null;
    const email = (data.claims as { email?: unknown }).email;
    return { id, email: typeof email === "string" ? email : null };
  } catch {
    return null;
  }
}

/** One profile read. A failed query throws (error boundary): it must not look like "signed out". */
export async function loadViewerProfile(supabase: Client, id: string): Promise<ViewerProfile | null> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`viewer profile read failed: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    timezone: data.timezone,
    deletedAt: data.deleted_at,
    username: data.username,
    firstName: data.first_name,
    lastName: data.last_name,
    avatarPath: data.avatar_path,
    avatarUpdatedAt: data.avatar_updated_at,
    avatarPreset: data.avatar_preset,
    timezoneChangedAt: data.timezone_changed_at,
    reminderTime: String(data.reminder_time),
  };
}

/** Auth only, no profile read: for pages that never read the profile (retos, invite). Memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => loadSessionUser(await createServerClient()));

/**
 * The single auth + profile read of a request, memoised: id, timezone and deleted flag, plus the
 * columns the adopted pages need. Null without a verified session or without a profile row.
 */
export const getViewerProfile = cache(async (): Promise<ViewerProfile | null> => {
  const session = await getSessionUser();
  if (!session) return null;
  return loadViewerProfile(await createServerClient(), session.id);
});

export const getViewer = async (): Promise<Viewer | null> => {
  const p = await getViewerProfile();
  return p ? { id: p.id, timezone: p.timezone, deletedAt: p.deletedAt } : null;
};

/** Where a page sends a visitor `getViewer` returned null for: signed out, or signed in without a profile row. */
export async function viewerMissingDestination(): Promise<string> {
  return (await getSessionUser()) ? "/login?error=perfil" : "/bienvenida";
}
