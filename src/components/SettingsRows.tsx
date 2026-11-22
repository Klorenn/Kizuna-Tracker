"use client";

import { Bell, CaretRight, Globe, Palette, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { setTimezone, updateSettings } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

type Props = {
  firstName: string;
  lastName: string;
  reminderTime: string; // HH:MM
  timezone: string;
};

function Row({ icon, label, value, onClick, disabled }: { icon: ReactNode; label: string; value?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center gap-3 px-4 text-left disabled:opacity-100"
    >
      <span className="shrink-0 text-ink">{icon}</span>
      <span className="min-w-0 flex-1 text-body text-ink">{label}</span>
      {value ? <span className="shrink-0 font-mono text-[15px] font-medium text-muted">{value}</span> : null}
      {disabled ? null : <CaretRight size={20} weight="light" className="shrink-0 text-muted" aria-hidden />}
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

/** Ajustes rows: name, reminder time, timezone (once every 7 days) and a theme placeholder. */
export function SettingsRows({ firstName, lastName, reminderTime, timezone }: Props) {
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
        {/* Placeholder: a later task wires Sistema / Claro / Oscuro */}
        <Row icon={<Palette size={20} weight="light" aria-hidden />} label="Tema" value="Sistema" disabled />
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
