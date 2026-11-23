import { CaretLeft, FileText, GlobeSimple, LockSimple, Scales, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { LoadFailed } from "@/components/LoadFailed";
import { NotificationSection } from "@/components/NotificationSection";
import { AccountRows, PreferenceRows } from "@/components/SettingsRows";
import { SignOutButton } from "@/components/SignOutButton";
import { ListRow, ListSection } from "@/components/ui/ListRow";
import { avatarUrl } from "@/lib/avatar";
import { loadDiscoverable } from "@/lib/discover-data";
import { createServerClient } from "@/lib/supabase/server";
import { timezoneLock } from "@/lib/profile-view";
import { getSessionUser, getViewerProfile, viewerMissingDestination } from "@/lib/viewer";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { DiscoverableSwitch } from "./DiscoverableSwitch";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  // one auth read and one profile read, both shared with the rest of the request
  const session = await getSessionUser();
  // the privacy switch is not part of the shared viewer read: its own query, started together with
  // the profile (null = the read failed)
  const [profile, discoverable] = await Promise.all([
    getViewerProfile(),
    session
      ? createServerClient()
          .then((supabase) => loadDiscoverable(supabase, session.id))
          .catch((): null => null)
      : Promise.resolve(null),
  ]);
  if (!profile) redirect(await viewerMissingDestination());

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const reminderTime = profile.reminderTime.slice(0, 5);
  const tzLock = timezoneLock(profile.timezoneChangedAt, new Date(), profile.timezone);

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
          firstName={profile.firstName}
          lastName={profile.lastName}
          reminderTime={reminderTime}
          username={profile.username}
          email={session?.email ?? null}
          avatarSrc={avatarUrl(profile.avatarPath, profile.avatarUpdatedAt)}
          avatarPreset={profile.avatarPreset}
        />
      </ListSection>

      <ListSection id="ajustes-preferencias" label="Preferencias">
        <PreferenceRows
          firstName={profile.firstName}
          lastName={profile.lastName}
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
        {discoverable === null ? (
          <div className="border-b border-line px-4 py-3">
            <LoadFailed href="/perfil/ajustes" />
          </div>
        ) : (
          <DiscoverableSwitch initial={discoverable} />
        )}
        <ListRow
          icon={<Scales size={20} weight="light" />}
          label="Tu peso y tu altura son privados. Nadie más puede verlos."
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
        <SignOutButton variant="row" userId={profile.id} />
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
