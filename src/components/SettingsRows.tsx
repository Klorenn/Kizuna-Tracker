"use client";

import { At, Bell, Camera, Copy, EnvelopeSimple, Globe, Palette, User, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTimezone, updateSettings } from "@/app/(app)/perfil/actions";
import { removeAvatar, setAvatarPreset } from "@/app/(app)/perfil/avatar-actions";
import { AvatarPicker } from "@/components/avatars/AvatarPicker";
import { setTheme } from "@/app/theme-actions";
import { useAvatarUpload } from "@/components/profile/useAvatarUpload";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ListRow } from "@/components/ui/ListRow";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Toast, useToast } from "@/components/ui/Toast";
import type { TimezoneLock } from "@/lib/profile-view";
import { THEMES, THEME_LABEL, type Theme } from "@/lib/theme";

type Result = { ok: true } | { ok: false; error: string };

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-center gap-1 text-small text-ink">
      <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
      {error}
    </p>
  );
}

/** Runs a server action, keeps its error, refreshes the page on success. */
function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  function run(action: () => Promise<Result>, onDone: () => void, onFail?: () => void) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) {
        onFail?.();
        return setError(r.error);
      }
      onDone();
      router.refresh();
    });
  }
  return { error, setError, busy, run };
}

/** Ajustes > Cuenta: name (editable), @usuario (copy), email (read-only), profile photo. */
export function AccountRows({
  firstName,
  lastName,
  reminderTime,
  username,
  email,
  avatarSrc,
  avatarPreset,
}: {
  firstName: string;
  lastName: string;
  reminderTime: string; // HH:MM, saved together with the name
  username: string;
  email: string | null;
  avatarSrc: string | null;
  avatarPreset: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // optimistic pick while the preset is being saved
  const [picked, setPicked] = useState<number | null>(null);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const { error, setError, busy, run } = useSave();
  const avatar = useAvatarUpload(() => {
    setPicked(null);
    setPhotoOpen(false);
  });
  const photoSave = useSave();
  const [toast, showToast] = useToast();
  const name = `${firstName} ${lastName}`;
  const hasPhoto = avatarSrc !== null;
  // the ring marks the saved cat; with a photo it is the fallback (the photo keeps priority)
  const shownPreset = picked ?? avatarPreset;

  const closePhoto = () => {
    setPhotoOpen(false);
    setPicked(null);
    photoSave.setError(null);
  };

  // Choosing a cat saves ONLY the preset: an uploaded photo stays (and keeps priority) until
  // "Quitar foto", the one path that deletes it, after its own confirmation.
  function choosePreset(n: number) {
    if (n === shownPreset) return;
    const previous = picked;
    setPicked(n);
    photoSave.run(
      () => setAvatarPreset(n),
      () => showToast("Avatar actualizado"),
      () => setPicked(previous),
    );
  }

  const close = () => {
    setOpen(false);
    setError(null);
  };

  async function copyHandle() {
    try {
      await navigator.clipboard.writeText(`@${username}`);
      showToast("Usuario copiado");
    } catch {
      showToast("No pudimos copiar tu usuario");
    }
  }

  return (
    <>
      <ListRow
        icon={<User size={20} weight="light" />}
        label="Nombre"
        value={name}
        chevron
        onClick={() => {
          setFirst(firstName);
          setLast(lastName);
          setOpen(true);
        }}
      />
      <ListRow
        icon={<At size={20} weight="light" />}
        label="Usuario"
        value={`@${username}`}
        mono
        trailing={<Copy size={18} weight="light" aria-hidden className="shrink-0 text-muted" />}
        onClick={copyHandle}
        aria-label={`Usuario @${username}. Copiar`}
      />
      <ListRow icon={<EnvelopeSimple size={20} weight="light" />} label="Correo" value={email ?? "Sin correo"} />
      <ListRow
        icon={<Camera size={20} weight="light" />}
        label="Foto de perfil"
        hint={avatar.busy ? "Subiendo foto…" : "Aparece en tu perfil"}
        trailing={<Avatar name={name} size="S" src={avatarSrc} preset={avatarPreset} />}
        chevron
        onClick={() => setPhotoOpen(true)}
      />
      {avatar.input}
      <Toast message={toast} />

      <Sheet open={photoOpen} title="Foto de perfil" onClose={closePhoto} tall>
        <div className="flex justify-center">
          <Avatar name={name} size="L" src={avatarSrc} preset={picked ?? avatarPreset} />
        </div>
        <Button variant="secondary" onClick={avatar.pick} disabled={avatar.busy || photoSave.busy}>
          <Camera size={20} weight="light" aria-hidden />
          {avatar.busy ? "Subiendo foto…" : "Subir foto"}
        </Button>
        <div className="flex flex-col gap-2">
          <p className="section-label text-muted">O elige un avatar</p>
          <AvatarPicker
            layout="grid"
            label="Elige tu avatar"
            value={shownPreset}
            onChange={choosePreset}
            disabled={photoSave.busy || avatar.busy}
          />
          {hasPhoto ? (
            <p className="text-small text-pretty text-muted">
              Tu foto sigue visible. Toca &apos;Quitar foto&apos; para mostrar el gatito.
            </p>
          ) : null}
        </div>
        <ErrorText error={photoSave.error ?? avatar.error} />
        {hasPhoto ? (
          <Button variant="ghost" disabled={photoSave.busy || avatar.busy} onClick={() => setConfirmRemove(true)}>
            Quitar foto
          </Button>
        ) : null}
      </Sheet>

      <Sheet
        open={confirmRemove}
        title="¿Quitar tu foto?"
        onClose={() => setConfirmRemove(false)}
        describedBy="quitar-foto-cuerpo"
      >
        <p id="quitar-foto-cuerpo" className="text-body text-muted">
          Se borra la foto que subiste y vuelve a verse tu gatito.
        </p>
        <ErrorText error={photoSave.error} />
        <div className="flex flex-col gap-2">
          <Button
            disabled={photoSave.busy}
            onClick={() =>
              photoSave.run(removeAvatar, () => {
                setConfirmRemove(false);
                showToast("Foto quitada");
              })
            }
          >
            Quitar foto
          </Button>
          <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>

      <Sheet open={open} title="Nombre" onClose={close}>
        <Input label="Nombre" value={first} maxLength={40} onChange={(e) => setFirst(e.target.value)} />
        <Input label="Apellido" value={last} maxLength={40} onChange={(e) => setLast(e.target.value)} />
        <ErrorText error={error} />
        <Button
          disabled={busy || (first.trim() === firstName && last.trim() === lastName)}
          onClick={() => run(() => updateSettings({ firstName: first, lastName: last, reminderTime }), close)}
        >
          Guardar
        </Button>
      </Sheet>
    </>
  );
}

function zones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  return list.includes(current) ? list : [current, ...list];
}

const city = (tz: string) => tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

const THEME_OPTIONS = THEMES.map((value) => ({ value, label: THEME_LABEL[value] }));

/** Sistema / Claro / Oscuro. Applies at once on <html>, then the cookie keeps it for the next SSR. */
function ThemeRow({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function choose(next: Theme) {
    const previous = theme;
    setError(null);
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    start(async () => {
      const r = await setTheme(next);
      if (!r.ok) {
        setThemeState(previous);
        document.documentElement.dataset.theme = previous;
        setError(r.error);
        return;
      }
      router.refresh(); // theme-color meta and status bar follow the cookie
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 pb-4 pt-3.5">
      <div className="flex items-center gap-3">
        <Palette size={20} weight="light" className="shrink-0 text-ink" aria-hidden />
        <span className="text-body text-ink">Tema</span>
      </div>
      <Segmented label="Tema" options={THEME_OPTIONS} value={theme} onChange={choose} />
      <ErrorText error={error} />
    </div>
  );
}

/** Ajustes > Preferencias: theme, reminder time and timezone (once every 7 days). */
export function PreferenceRows({
  firstName,
  lastName,
  reminderTime,
  timezone,
  theme,
  tzLock,
}: {
  firstName: string;
  lastName: string;
  reminderTime: string; // HH:MM
  timezone: string;
  theme: Theme;
  tzLock: TimezoneLock;
}) {
  const [sheet, setSheet] = useState<null | "time" | "tz">(null);
  const [time, setTime] = useState(reminderTime);
  const [tz, setTz] = useState(timezone);
  const { error, setError, busy, run } = useSave();

  const close = () => {
    setSheet(null);
    setError(null);
  };
  const lockText = tzLock.locked ? `Podrás cambiarla el ${tzLock.label}` : null;

  return (
    <>
      <ThemeRow initial={theme} />
      <ListRow
        icon={<Bell size={20} weight="light" />}
        label="Hora de recordatorio"
        hint="Si te queda algo pendiente"
        value={reminderTime}
        mono
        chevron
        onClick={() => {
          setTime(reminderTime);
          setSheet("time");
        }}
      />
      <ListRow
        icon={<Globe size={20} weight="light" />}
        label="Zona horaria"
        hint={lockText ?? "Una vez cada 7 días"}
        value={city(timezone)}
        chevron
        onClick={() => {
          setTz(timezone);
          setSheet("tz");
        }}
      />

      <Sheet open={sheet === "time"} title="Hora de recordatorio" onClose={close}>
        <Input label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <ErrorText error={error} />
        <Button
          disabled={busy || !time || time === reminderTime}
          onClick={() => run(() => updateSettings({ firstName, lastName, reminderTime: time }), close)}
        >
          Guardar
        </Button>
      </Sheet>

      <Sheet open={sheet === "tz"} title="Zona horaria" onClose={close}>
        <label className="flex flex-col gap-2 text-small text-ink">
          Zona horaria
          <select
            value={tz}
            disabled={tzLock.locked}
            onChange={(e) => setTz(e.target.value)}
            className="h-11 rounded-md border border-outline-strong bg-paper px-3 text-body text-ink disabled:border-line disabled:text-muted"
          >
            {zones(timezone).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="text-small text-muted">
          {tzLock.locked
            ? `Ya la cambiaste hace poco. Podrás cambiarla de nuevo el ${tzLock.label}.`
            : "Tus días se cuentan en esta zona. Puedes cambiarla una vez cada 7 días."}
        </p>
        <ErrorText error={error} />
        <Button disabled={busy || tzLock.locked || tz === timezone} onClick={() => run(() => setTimezone(tz), close)}>
          Guardar
        </Button>
      </Sheet>
    </>
  );
}
