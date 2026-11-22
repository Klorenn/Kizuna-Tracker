"use client";

import { Bell, CaretRight, Globe, Palette, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { setTimezone, updateSettings } from "@/app/(app)/perfil/actions";
import { setTheme } from "@/app/theme-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { THEMES, THEME_LABEL, type Theme } from "@/lib/theme";

type Props = {
  firstName: string;
  lastName: string;
  reminderTime: string; // HH:MM
  timezone: string;
  theme: Theme;
};

function Row({ icon, label, value, onClick }: { icon: ReactNode; label: string; value?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-[52px] w-full items-center gap-3 px-4 text-left">
      <span className="shrink-0 text-ink">{icon}</span>
      <span className="min-w-0 flex-1 text-body text-ink">{label}</span>
      {value ? <span className="shrink-0 font-mono text-[15px] font-medium text-muted">{value}</span> : null}
      <CaretRight size={20} weight="light" className="shrink-0 text-muted" aria-hidden />
    </button>
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
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3.5">
      <div className="flex items-center gap-3">
        <Palette size={20} weight="light" className="shrink-0 text-ink" aria-hidden />
        <span className="text-body text-ink">Tema</span>
      </div>
      <Segmented label="Tema" options={THEME_OPTIONS} value={theme} onChange={choose} />
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ajustes rows: name, reminder time, timezone (once every 7 days) and the theme. */
export function SettingsRows({ firstName, lastName, reminderTime, timezone, theme }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "name" | "time" | "tz">(null);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [time, setTime] = useState(reminderTime);
  const [tz, setTz] = useState(timezone);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const close = () => {
    setSheet(null);
    setError(null);
  };

  function save() {
    setError(null);
    start(async () => {
      const r = await updateSettings({ firstName: first, lastName: last, reminderTime: time });
      if (!r.ok) return setError(r.error);
      close();
      router.refresh();
    });
  }

  function saveTz() {
    setError(null);
    start(async () => {
      const r = await setTimezone(tz);
      if (!r.ok) return setError(r.error);
      close();
      router.refresh();
    });
  }

  const err = error ? (
    <p role="alert" className="text-small text-ink">
      {error}
    </p>
  ) : null;

  return (
    <>
      <div className="divide-y divide-line">
        <Row icon={<User size={20} weight="light" aria-hidden />} label="Nombre" value={`${firstName}`} onClick={() => setSheet("name")} />
        <Row icon={<Bell size={20} weight="light" aria-hidden />} label="Hora de recordatorio" value={reminderTime} onClick={() => setSheet("time")} />
        <Row icon={<Globe size={20} weight="light" aria-hidden />} label="Zona horaria" value={city(timezone)} onClick={() => setSheet("tz")} />
        <ThemeRow initial={theme} />
      </div>

      <Sheet open={sheet === "name"} title="Nombre" onClose={close}>
        <Input label="Nombre" value={first} maxLength={40} onChange={(e) => setFirst(e.target.value)} />
        <Input label="Apellido" value={last} maxLength={40} onChange={(e) => setLast(e.target.value)} />
        {err}
        <Button disabled={busy} onClick={() => save()}>
          Guardar
        </Button>
      </Sheet>

      <Sheet open={sheet === "time"} title="Hora de recordatorio" onClose={close}>
        <Input label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        {err}
        <Button disabled={busy || !time} onClick={() => save()}>
          Guardar
        </Button>
      </Sheet>

      <Sheet open={sheet === "tz"} title="Zona horaria" onClose={close}>
        <label className="flex flex-col gap-2 text-small text-ink">
          Zona horaria
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="h-11 rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
          >
            {zones(timezone).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="text-small text-muted">Puedes cambiarla una vez cada 7 días.</p>
        {err}
        <Button disabled={busy || tz === timezone} onClick={saveTz}>
          Guardar
        </Button>
      </Sheet>
    </>
  );
}
