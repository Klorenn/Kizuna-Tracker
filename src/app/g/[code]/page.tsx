import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { eligibleGroupHabits, linkedHabitIds } from "@/domain/group-habits";
import { groupInviteLoginHref } from "@/domain/group-join";
import { inviteUrlPath, normalizeInviteCode } from "@/domain/groups";
import { loadHabitCandidates } from "@/lib/group-habits-data";
import { loadInvitePreview, loadMyGroups } from "@/lib/groups-data";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { JoinGroup } from "./JoinGroup";

export const metadata: Metadata = { title: "Invitación a un grupo", robots: { index: false, follow: false } };

/**
 * PUBLIC page (outside `(app)`): a signed-out visitor sees the preview and a login link. It reads
 * only through the invitation-preview loader and shows only what the preview carries, never member
 * names. A signed-in visitor also gets the habits they can bring (own, not already in a group).
 * GET shows; joining is a server action (requireUser first), so a link elsewhere can join nobody.
 */
export default async function UnirsePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: typed } = await params;
  const code = normalizeInviteCode(typed);
  // /g/k7qm-4pxd and /g/K7QM4PXD are the same invitation: one canonical URL
  if (code !== null && code !== typed) redirect(inviteUrlPath(code));
  const user = await getSessionUser();
  const supabase = await createServerClient();

  const [preview, groups, candidates] = await Promise.all([
    loadInvitePreview(code ?? '', supabase),
    user ? loadMyGroups(supabase) : null,
    user ? loadHabitCandidates(user.id, supabase) : null,
  ]);

  const failed = !preview.ok || (user !== null && (!groups?.ok || !candidates?.ok));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
      {failed || !preview.ok ? (
        <Card className="px-6 py-8">
          <LoadFailed href={code ? inviteUrlPath(code) : "/"} />
        </Card>
      ) : (
        <JoinGroup
          preview={preview.data}
          signedIn={user !== null}
          loginHref={code ? groupInviteLoginHref(code) : "/login"}
          habits={
            groups?.ok && candidates?.ok
              ? eligibleGroupHabits(candidates.data, linkedHabitIds(groups.data), {
                  requiresPhoto: preview.data?.commitment.requiresPhoto ?? false,
                })
              : []
          }
          code={code ?? ""}
        />
      )}
    </main>
  );
}
