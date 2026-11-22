"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { TopBar } from "@/components/ui/TopBar";
import { localDate } from "@/domain/dates";
import {
  UNDERAGE_ERROR,
  normalizeUsername,
  validateSignup,
  validateSignupStep,
  type SignupInput,
  type SignupStep,
} from "@/lib/signup";
import { checkUsername, signUp } from "./actions";

type Availability = "idle" | "checking" | "available" | "taken" | "limited";

const TITLES: Record<SignupStep, string> = {
  1: "¿Cómo te llamas?",
  2: "¿Cuándo naciste?",
  3: "Elige tu @usuario",
  4: "Tu correo",
  5: "Crea una contraseña",
};

const FIGMA_UNDERAGE_HINT = "Debes tener 18 años o más.";

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function pad(v: string, n: number) {
  return v.length === 0 ? "" : v.padStart(n, "0");
}

function Hint({
  tone,
  children,
}: {
  tone: "ok" | "error" | "muted";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? Warning : Check;
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={`flex items-center gap-[6px] text-small ${tone === "muted" ? "text-muted" : "text-ink"}`}
    >
      <Icon
        size={16}
        weight="light"
        className={tone === "error" ? "text-alert" : tone === "ok" ? "text-accent" : "text-muted"}
        aria-hidden
      />
      {children}
    </p>
  );
}

function BirthSegments({
  value,
  onChange,
  invalid,
}: {
  value: { d: string; m: string; y: string };
  onChange: (patch: Partial<{ d: string; m: string; y: string }>) => void;
  invalid: boolean;
}) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const seg = (
    key: "d" | "m" | "y",
    label: string,
    max: number,
    idx: number,
    cls: string,
  ) => (
    <div className={`flex flex-col gap-1 ${cls}`}>
      <label htmlFor={`bd-${key}`} className="text-small text-muted">
        {label}
      </label>
      <input
        id={`bd-${key}`}
        ref={refs[idx]}
        inputMode="numeric"
        autoComplete={key === "d" ? "bday-day" : key === "m" ? "bday-month" : "bday-year"}
        maxLength={max}
        value={value[key]}
        placeholder={key === "y" ? "AAAA" : key === "d" ? "DD" : "MM"}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, max);
          onChange({ [key]: digits });
          if (digits.length === max && idx < 2) refs[idx + 1].current?.focus();
        }}
        onBlur={(e) => {
          if (key !== "y") onChange({ [key]: pad(e.currentTarget.value, 2) });
        }}
        className={`h-[52px] w-full rounded-md bg-paper px-3 font-mono text-[20px] font-medium text-ink outline-none placeholder:text-muted ${
          invalid
            ? "border border-alert focus:border-2"
            : "border border-outline-strong focus:border-2 focus:border-accent"
        }`}
      />
    </div>
  );
  return (
    <div className="flex items-end gap-2">
      {seg("d", "Día", 2, 0, "w-[90px] shrink-0")}
      {seg("m", "Mes", 2, 1, "w-[90px] shrink-0")}
      {seg("y", "Año", 4, 2, "min-w-0 flex-1")}
    </div>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>(1);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    passwordConfirm: "",
    acceptTerms: false,
  });
  const [birth, setBirth] = useState({ d: "", m: "", y: "" });
  const [showPw, setShowPw] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [today] = useState(() => localDate(new Date(), browserTimezone()));

  const birthDate =
    birth.d && birth.m && birth.y.length === 4
      ? `${birth.y}-${pad(birth.m, 2)}-${pad(birth.d, 2)}`
      : "";
  const input: Partial<SignupInput> = { ...form, birthDate };
  const check = validateSignupStep(step, input, today);
  const username = normalizeUsername(form.username);

  // Debounced availability check (300 ms) for step 3.
  useEffect(() => {
    if (step !== 3) return;
    if (!validateSignupStep(3, { username }, today).ok) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await checkUsername(username);
      if (!cancelled) setAvailability(res.rateLimited ? "limited" : res.available ? "available" : "taken");
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, username, today]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setSubmitError(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const canContinue =
    check.ok && (step !== 3 || availability === "available") && !pending;

  function back() {
    if (step === 1) router.push("/bienvenida");
    else setStep((s) => (s - 1) as SignupStep);
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    if (step < 5) {
      setStep((s) => (s + 1) as SignupStep);
      return;
    }
    const full: SignupInput = {
      ...form,
      birthDate,
      timezone: browserTimezone(),
    };
    const result = validateSignup(full, today);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    startTransition(async () => {
      const res = await signUp(full);
      // On success the action redirects to /listo.
      if (res && !res.ok) setSubmitError(res.error);
    });
  }

  const birthComplete = birthDate !== "";
  const birthError = birthComplete && !check.ok && step === 2 ? check : null;
  const underage = birthError?.error === UNDERAGE_ERROR;
  const pw = form.password;
  const rules = [
    { ok: pw.length >= 8, label: "Mínimo 8 caracteres" },
    { ok: /\p{L}/u.test(pw), label: "Una letra" },
    { ok: /\d/.test(pw), label: "Un número" },
  ];
  const mismatch = form.passwordConfirm !== "" && form.password !== form.passwordConfirm;
  const eye = (
    <button
      type="button"
      aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
      onClick={() => setShowPw((v) => !v)}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted"
    >
      {showPw ? <EyeSlash size={20} weight="light" /> : <Eye size={20} weight="light" />}
    </button>
  );

  return (
    <form
      onSubmit={next}
      noValidate
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-3"
    >
      <div className="flex flex-col gap-4 pb-28">
        <TopBar onBack={back} step={step} total={5} />
        <h1 className="text-heading font-semibold text-ink">{TITLES[step]}</h1>

        {step === 1 && (
          <>
            <Input
              label="Nombre"
              name="firstName"
              autoComplete="given-name"
              placeholder="Carolina"
              maxLength={40}
              autoFocus
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
            <Input
              label="Apellido"
              name="lastName"
              autoComplete="family-name"
              placeholder="Méndez"
              maxLength={40}
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-small text-ink">Fecha de nacimiento</p>
            <BirthSegments value={birth} onChange={(patch) => setBirth((b) => ({ ...b, ...patch }))} invalid={!!birthError} />
            {birthError ? (
              <Hint tone="error">
                {underage ? FIGMA_UNDERAGE_HINT : birthError.error}
              </Hint>
            ) : (
              <Hint tone="muted">{FIGMA_UNDERAGE_HINT}</Hint>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Input
              label="Usuario"
              name="username"
              prefix="@"
              placeholder="caro_fit"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={21}
              autoFocus
              value={form.username}
              error={
                form.username !== "" && !check.ok
                  ? check.error
                  : availability === "limited"
                    ? "Demasiadas consultas. Espera un momento e inténtalo de nuevo."
                  : availability === "taken"
                    ? `@${username} ya está en uso. Prueba @${username.slice(0, 18)}_1.`
                    : null
              }
              onChange={(e) =>
                set("username", e.target.value.replace(/\s/g, "").toLowerCase())
              }
            />
            {availability === "available" && (
              <>
                <Hint tone="ok">@{username} está disponible</Hint>
                <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                  <p className="section-label text-muted">Así te verán tus amigos</p>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-ink-soft font-mono text-label font-medium tracking-[0.04em] text-ink"
                    >
                      {(form.firstName[0] ?? "").toUpperCase()}
                      {(form.lastName[0] ?? "").toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <p className="truncate text-body font-medium text-ink">
                        {form.firstName.trim()} {form.lastName.trim()}
                      </p>
                      <p className="text-small text-muted">@{username}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <Input
            label="Correo"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="carolina.mendez@correo.cl"
            autoFocus
            value={form.email}
            helper="Lo usarás para iniciar sesión."
            error={
              form.email.includes("@") && form.email.includes(".") && !check.ok
                ? check.error
                : null
            }
            onChange={(e) => set("email", e.target.value)}
          />
        )}

        {step === 5 && (
          <>
            <Input
              label="Contraseña"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              placeholder="•••••••••"
              trailing={eye}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
            <Input
              label="Confirmar contraseña"
              name="passwordConfirm"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="•••••••••"
              trailing={eye}
              value={form.passwordConfirm}
              error={mismatch ? "Las contraseñas no coinciden." : null}
              onChange={(e) => set("passwordConfirm", e.target.value)}
            />
            <ul className="flex flex-col gap-2">
              {rules.map((r) => (
                <li
                  key={r.label}
                  className={`flex items-center gap-2 text-small ${r.ok ? "text-ink" : "text-muted"}`}
                >
                  {r.ok ? (
                    <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-accent text-on-accent">
                      <Check size={12} weight="bold" aria-hidden />
                    </span>
                  ) : (
                    <span className="size-[18px] rounded-full border border-outline-strong" aria-hidden />
                  )}
                  {r.label}
                </li>
              ))}
            </ul>
            <Checkbox
              label="Acepto los términos y la privacidad"
              checked={form.acceptTerms}
              onChange={(e) => set("acceptTerms", e.target.checked)}
            />
            {submitError && <Hint tone="error">{submitError}</Hint>}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-paper px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
        <div className="mx-auto max-w-md">
          <Button type="submit" disabled={!canContinue}>
            {step === 5 ? (pending ? "Creando…" : "Crear cuenta") : "Continuar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
