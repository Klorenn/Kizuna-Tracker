import { CaretLeft, FileText, GlobeSimple, LockSimple, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { NotificationSection } from "@/components/NotificationSection";
import { AccountRows, PreferenceRows } from "@/components/SettingsRows";
import { SignOutButton } from "@/components/SignOutButton";
import { ListRow, ListSection } from "@/components/ui/ListRow";
import { avatarUrl } from "@/lib/avatar";
import { timezoneLock } from "@/lib/profile-view";
import { createServerClient } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase
    .from("profiles")
    .select("username,first_name,last_name,avatar_path,avatar_updated_at,avatar_preset,timezone,timezone_changed_at,reminder_time")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const reminderTime = String(profile.reminder_time).slice(0, 5);
  const tzLock = timezoneLock(profile.timezone_changed_at, new Date(), profile.timezone);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-1">
      <div className="flex flex-col gap-1">
        <Link href="/perfil" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Perfil
        </Link>
        <h1 className="text-display font-semibold text-ink">Ajustes</h1>
      </div>

      <ListSection id="ajustes-cuenta" label="Cuenta">
        <AccountRows
          firstName={profile.first_name}
          lastName={profile.last_name}
          reminderTime={reminderTime}
          username={profile.username}
          email={user.email ?? null}
          avatarSrc={avatarUrl(profile.avatar_path, profile.avatar_updated_at)}
          avatarPreset={profile.avatar_preset}
        />
      </ListSection>

      <ListSection id="ajustes-preferencias" label="Preferencias">
        <PreferenceRows
          firstName={profile.first_name}
          lastName={profile.last_name}
          reminderTime={reminderTime}
          timezone={profile.timezone}
          theme={theme}
          tzLock={tzLock}
        />
      </ListSection>

      <NotificationSection />

      <ListSection id="ajustes-privacidad" label="Privacidad">
        <ListRow
          icon={<LockSimple size={20} weight="light" />}
          label="Tus fotos solo las ven tus amigos"
          hint="Las fotos de prueba nunca son públicas. Tu perfil público solo muestra tus hábitos públicos."
        />
        <ListRow
          href={`/@${profile.username}`}
          icon={<GlobeSimple size={20} weight="light" />}
          label="Ver perfil público"
          value={`@${profile.username}`}
          mono
          chevron
        />
      </ListSection>

      <ListSection id="ajustes-legal" label="Legal">
        <ListRow href="/legal/terminos" icon={<FileText size={20} weight="light" />} label="Términos de uso" chevron />
        <ListRow href="/legal/privacidad" icon={<ShieldCheck size={20} weight="light" />} label="Política de privacidad" chevron />
      </ListSection>

      <ListSection id="ajustes-sesion" label="Sesión">
        <SignOutButton variant="row" />
      </ListSection>

      <ListSection
        id="ajustes-peligro"
        label="Zona de peligro"
        footer="Se borran tus fotos y datos, y no podrás volver a entrar. Tus amigos conservan el historial de deudas como “Cuenta eliminada”."
      >
        <DeleteAccountButton username={profile.username} variant="row" />
      </ListSection>
    </main>
  );
}
