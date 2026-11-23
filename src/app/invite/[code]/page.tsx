import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acceptInviteAction } from "@/app/(app)/amigos/actions";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { avatarUrl } from "@/lib/avatar";
import { INVITE_ERRORS, INVITE_GENERIC } from "@/lib/invites";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Invitación", robots: { index: false, follow: false } };

/**
 * GET only shows who invited you. Accepting is a POST server action (Origin-checked by
 * Next), so a link on another site can never make a logged-in user friends with anyone.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = (await searchParams) ?? {};
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);

  const supabase = await createServerClient();
  const { data: preview } = await supabase.rpc("invite_preview", { p_code: code });
  const inviter = preview as {
    username: string;
    displayName: string;
    avatarPath?: string | null;
    avatarPreset?: number | null;
  } | null;
  const failure = error ? (INVITE_ERRORS[error] ?? INVITE_GENERIC) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
      <Card>
        {inviter ? (
          <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
            <Avatar
              name={inviter.displayName}
              size="L"
              src={avatarUrl(inviter.avatarPath ?? null)}
              preset={inviter.avatarPreset}
            />
            <div className="flex flex-col gap-1">
              <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{inviter.displayName}</p>
              <p className="text-small text-muted">@{inviter.username}</p>
            </div>
            <p className="text-body text-muted">Te invitó a ser su amigo en Kizuna.</p>
            {failure ? (
              <p role="alert" className="text-small text-ink">
                {failure}
              </p>
            ) : null}
            <form action={acceptInviteAction.bind(null, code)} className="flex w-full flex-col gap-2">
              <Button type="submit">Aceptar invitación</Button>
              <ButtonLink href="/amigos" variant="ghost">
                Ahora no
              </ButtonLink>
            </form>
          </div>
        ) : (
          <EmptyState
            title="No pudimos usar esta invitación"
            body={failure ?? "La invitación no existe o ya venció."}
            action={
              <ButtonLink href="/amigos" className="w-auto!">
                Ir a Amigos
              </ButtonLink>
            }
          />
        )}
      </Card>
    </main>
  );
}
