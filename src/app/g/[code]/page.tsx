import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { inviteRouteDecision, TOO_MANY_COPY } from "@/domain/group-invite";
import { eligibleGroupHabits, linkedHabitIds } from "@/domain/group-habits";
import { groupInviteLoginHref } from "@/domain/group-join";
import { loadHabitCandidates } from "@/lib/group-habits-data";
import { loadMyGroups } from "@/lib/groups-data";
import { lookupInvite, pageInviteKey, PAGE_LIMIT } from "@/lib/groups-invite-server";
import { skipRateLimit } from "@/lib/rate-limit-mode";
import { clientIp } from "@/lib/request-ip";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { JoinGroup } from "./JoinGroup";

export const metadata: Metadata = { title: "Invitación a un grupo", robots: { index: false, follow: false } };

const frame = "mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8";

/**
 * PUBLIC page (outside `(app)`): a signed-out visitor sees the preview and a login link, never member names. The lookup
 * goes through the service-role preview (`lookupInvite`): wrong guesses are counted per client address, and a signed-in
 * member gets "Ya eres parte de este grupo." with a link. A variant of the code redirects to the canonical URL.
 * GET shows; joining is a server action (requireUser first), so a link elsewhere can join nobody.
 */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: typed } = await params;
  const route = inviteRouteDecision(typed);
  if (route.kind === "redirect") redirect(route.to);

  if (route.kind === "invalid") {
    return (
      <main className={frame}>
        <JoinGroup preview={null} signedIn={false} loginHref="/login" habits={[]} code="" groupHref="/grupos" />
      </main>
    );
  }

  const { code } = route;
  const user = await getSessionUser();
  const ip = clientIp(await headers());
  const supabase = await createServerClient();

  const [outcome, groups, candidates] = await Promise.all([
    lookupInvite({ code, viewerId: user?.id ?? null, key: skipRateLimit(ip) ? null : pageInviteKey(ip), ...PAGE_LIMIT }),
    user ? loadMyGroups(supabase) : null,
    user ? loadHabitCandidates(user.id, supabase) : null,
  ]);

  if (outcome.kind === "blocked") {
    return (
      <main className={frame}>
        <Card className="px-6 py-8">
          <p role="status" className="text-body text-ink">
            {TOO_MANY_COPY}
          </p>
        </Card>
      </main>
    );
  }
  const member = outcome.kind === "found" && outcome.data.memberGroupId !== null;
  const habitsFailed = user !== null && !member && (!groups?.ok || !candidates?.ok);
  if (outcome.kind === "failed" || habitsFailed) {
    return (
      <main className={frame}>
        <Card className="px-6 py-8">
          <LoadFailed href={`/g/${code}`} />
        </Card>
      </main>
    );
  }

  const found = outcome.kind === "found" ? outcome.data : null;
  return (
    <main className={frame}>
      <JoinGroup
        preview={found?.preview ?? null}
        signedIn={user !== null}
        loginHref={groupInviteLoginHref(code)}
        habits={
          groups?.ok && candidates?.ok
            ? eligibleGroupHabits(candidates.data, linkedHabitIds(groups.data), {
                requiresPhoto: found?.preview.commitment.requiresPhoto ?? false,
              })
            : []
        }
        code={code}
        groupHref={found?.memberGroupId ? `/grupos/${found.memberGroupId}` : "/grupos"}
        alreadyMember={member}
      />
    </main>
  );
}
