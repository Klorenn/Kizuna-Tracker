"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LegalLink } from "@/components/legal/LegalLink";
import { useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { BottomActionBar } from "@/components/auth/BottomActionBar";
import { Hint } from "@/components/auth/Hint";
import { KanjiWatermark } from "@/components/auth/KanjiWatermark";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { StepTitle } from "@/components/auth/StepTitle";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
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

/** Figma A1–A5 titles, plus one plain line of context per step. */
const COPY: Record<SignupStep, { title: string; subtitle: string }> = {
  1: { title: "¿Cómo te llamas?", subtitle: "Así te reconocerán tus amigos." },
  2: { title: "¿Cuándo naciste?", subtitle: "Kizuna es para mayores de 18." },
  3: { title: "Elige tu @usuario", subtitle: "Es tu nombre en los retos y en tu perfil." },
  4: { title: "Tu correo", subtitle: "Lo usarás para iniciar sesión." },
  5: { title: "Crea una contraseña", subtitle: "La usarás junto a tu correo o tu @usuario." },
};

const FIGMA_UNDERAGE_HINT = "Debes tener 18 años o más.";

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function pad(v: string, n: number) {
  return v.length === 0 ? "" : v.padStart(n, "0");
}

const segmentBase =
  "h-[52px] w-full rounded-md border bg-paper px-3 font-mono text-[20px] font-medium tabular-nums text-ink caret-accent outline-none transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(.2,0,0,1)] placeholder:text-muted/60";

/** Figma A2: three mono segments (Día 90 · Mes 90 · Año fill), auto-advance on full entry. */
function BirthSegments({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: { d: string; m: string; y: string };
  onChange: (patch: Partial<{ d: string; m: string; y: string }>) => void;
  invalid: boolean;
  describedBy?: string;
}) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const seg = (key: "d" | "m" | "y", label: string, max: number, idx: number, cls: string) => (
    <div className={`flex flex-col gap-1 ${cls}`}>
      <label htmlFor={`bd-${key}`} className="text-small text-muted">
        {label}
      </label>
      <input
        id={`bd-${key}`}
        ref={refs[idx]}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={key === "d" ? "bday-day" : key === "m" ? "bday-month" : "bday-year"}
        enterKeyHint={idx < 2 ? "next" : "go"}
        autoFocus={idx === 0}
        maxLength={max}
        value={value[key]}
        placeholder={key === "y" ? "AAAA" : key === "d" ? "DD" : "MM"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, max);
          onChange({ [key]: digits });
          if (digits.length === max && idx < 2) refs[idx + 1].current?.focus();
        }}
        onKeyDown={(e) => {
          // Backspace on an empty segment goes back to the previous one.
          if (e.key === "Backspace" && e.currentTarget.value === "" && idx > 0) {
            e.preventDefault();
            refs[idx - 1].current?.focus();
          }
        }}
        onBlur={(e) => {
          if (key !== "y") onChange({ [key]: pad(e.currentTarget.value, 2) });
        }}
        className={`${segmentBase} ${
          invalid
            ? "border-alert focus:shadow-[inset_0_0_0_1px_var(--color-alert)]"
            : "border-outline-strong focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--color-accent)]"
        }`}
      />
    </div>
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-small text-ink">Fecha de nacimiento</legend>
      <div className="flex items-end gap-2">
        {seg("d", "Día", 2, 0, "w-[90px] shrink-0")}
        {seg("m", "Mes", 2, 1, "w-[90px] shrink-0")}
        {seg("y", "Año", 4, 2, "min-w-0 flex-1")}
      </div>
    </fieldset>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>(1);
  const [dir, setDir] = useState<"forward" | "back">("forward");
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
  const stepRef = useRef<HTMLDivElement>(null);

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

  function go(to: SignupStep, direction: "forward" | "back") {
    setDir(direction);
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  function back() {
    if (step === 1) router.push("/bienvenida");
    else go((step - 1) as SignupStep, "back");
  }

  /** Enter on an incomplete step moves focus to the first empty field instead of doing nothing. */
  function focusFirstEmpty() {
    const fields = stepRef.current?.querySelectorAll<HTMLInputElement>(
      "input:not([type=checkbox]):not([type=hidden])",
    );
    const target = [...(fields ?? [])].find((el) => el.value.trim() === "");
    target?.focus();
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) {
      focusFirstEmpty();
      return;
    }
    if (step < 5) {
      go((step + 1) as SignupStep, "forward");
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
  // Flag a mismatch once the confirmation is as long as the password, not on every keystroke.
  const mismatch =
    form.passwordConfirm !== "" &&
    form.passwordConfirm.length >= form.password.length &&
    form.password !== form.passwordConfirm;
  const eye = <PasswordToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />;
  const initials = `${(form.firstName.trim()[0] ?? "").toUpperCase()}${(form.lastName.trim()[0] ?? "").toUpperCase()}`;

  return (
    <form
      onSubmit={next}
      onKeyDown={(e) => {
        // A disabled submit blocks implicit submission, so Enter would do nothing;
        // move to the next empty field instead.
        const t = e.target as HTMLInputElement;
        if (e.key === "Enter" && t.tagName === "INPUT" && t.type !== "checkbox" && !canContinue) {
          e.preventDefault();
          focusFirstEmpty();
        }
      }}
      noValidate
      className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col px-5"
    >
      <KanjiWatermark />
      <div className="flex flex-col gap-4 pb-32">
        <AuthTopBar onBack={back} step={step} total={5} />

        <div key={step} ref={stepRef} data-dir={dir} className="auth-step flex flex-col gap-4">
          <StepTitle id="step-title" title={COPY[step].title} subtitle={COPY[step].subtitle} />

          {step === 1 && (
            <>
              <Input
                label="Nombre"
                name="firstName"
                autoComplete="given-name"
                autoCapitalize="words"
                enterKeyHint="next"
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
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Méndez"
                maxLength={40}
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </>
          )}

          {step === 2 && (
            <>
              <BirthSegments
                value={birth}
                onChange={(patch) => setBirth((b) => ({ ...b, ...patch }))}
                invalid={!!birthError}
                describedBy={birthError ? "bd-msg" : undefined}
              />
              {birthError ? (
                <Hint tone="error" id="bd-msg">
                  {underage ? FIGMA_UNDERAGE_HINT : birthError.error}
                </Hint>
              ) : null}
            </>
          )}

          {step === 3 && (
            <>
              <Input
                label="Usuario"
                name="username"
                prefix="@"
                placeholder="kizuna"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
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
              <div aria-live="polite" className="flex flex-col gap-4">
                {availability === "checking" && (
                  <Hint tone="muted">Revisando disponibilidad…</Hint>
                )}
                {availability === "available" && (
                  <>
                    <Hint tone="ok">@{username} está disponible</Hint>
                    <div className="auth-step flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                      <p className="section-label text-muted">Así te verán tus amigos</p>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-ink-soft font-mono text-label font-medium tracking-[0.04em] text-ink"
                        >
                          {initials}
                        </span>
                        <div className="flex min-w-0 flex-col gap-[2px]">
                          <p className="truncate text-body font-medium text-ink">
                            {form.firstName.trim()} {form.lastName.trim()}
                          </p>
                          <p className="truncate text-small text-muted">@{username}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
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
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="kizuna@gmail.com"
              autoFocus
              value={form.email}
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
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                readOnly
                hidden
              />
              <Input
                label="Contraseña"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                enterKeyHint="next"
                autoFocus
                placeholder="•••••••••"
                aria-describedby="pw-rules"
                trailing={eye}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <Input
                label="Confirmar contraseña"
                name="passwordConfirm"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                enterKeyHint="done"
                placeholder="•••••••••"
                trailing={eye}
                value={form.passwordConfirm}
                error={mismatch ? "Las contraseñas no coinciden." : null}
                onChange={(e) => set("passwordConfirm", e.target.value)}
              />
              <ul id="pw-rules" className="flex flex-col gap-2" aria-label="Requisitos de la contraseña">
                {rules.map((r) => (
                  <li
                    key={r.label}
                    className={`flex items-center gap-2 text-small transition-colors duration-[120ms] ${r.ok ? "text-ink" : "text-muted"}`}
                  >
                    <span
                      aria-hidden
                      className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-[120ms] ${
                        r.ok ? "border-accent bg-accent text-on-accent" : "border-outline-strong"
                      }`}
                    >
                      <Check
                        size={12}
                        weight="bold"
                        className={`transition-[opacity,transform] duration-[120ms] ${r.ok ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
                      />
                    </span>
                    {r.label}
                    <span className="sr-only">{r.ok ? ": cumplido" : ": pendiente"}</span>
                  </li>
                ))}
              </ul>
              <Checkbox
                label="Acepto los términos y la privacidad"
                checked={form.acceptTerms}
                onChange={(e) => set("acceptTerms", e.target.checked)}
              />
              <p className="text-small leading-7 text-muted">
                Lee los{" "}
                <LegalLink doc="terminos">
                  Términos de uso
                </LegalLink>{" "}
                y la{" "}
                <LegalLink doc="privacidad">
                  Política de privacidad
                </LegalLink>
                .
              </p>
              {submitError && <Hint tone="error">{submitError}</Hint>}
            </>
          )}
        </div>
      </div>

      <BottomActionBar>
        <Button type="submit" disabled={!canContinue}>
          {step === 5 ? (pending ? "Creando…" : "Crear cuenta") : "Continuar"}
        </Button>
      </BottomActionBar>
    </form>
  );
}
