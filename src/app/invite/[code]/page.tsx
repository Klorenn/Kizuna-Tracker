import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/app/(app)/amigos/actions";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invitación", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);

  const result = await acceptInvite(code);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
      <Card>
        <EmptyState
          title={result.ok ? "Ahora son amigos" : "No pudimos usar esta invitación"}
          body={
            result.ok
              ? result.inviterUsername
                ? `Ya estás conectado con @${result.inviterUsername}.`
                : "Ya estás conectado."
              : result.error
          }
          action={
            <ButtonLink href="/amigos" className="w-auto!">
              Ir a Amigos
            </ButtonLink>
          }
        />
      </Card>
    </main>
  );
}
