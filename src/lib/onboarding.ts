export type OnboardingInput = {
  username: string;
  displayName: string;
  timezone: string;
  isAdult: boolean;
  acceptTerms: boolean;
};

export type OnboardingResult = { ok: true } | { ok: false; error: string };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function isValidTimezone(tz: string): boolean {
  return tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz);
}

export function validateOnboarding(input: OnboardingInput): OnboardingResult {
  if (!input.isAdult) return { ok: false, error: "Tenés que ser mayor de 18" };
  if (!input.acceptTerms) {
    return { ok: false, error: "Tenés que aceptar los términos" };
  }
  if (!USERNAME_RE.test(input.username)) {
    return {
      ok: false,
      error: "El usuario debe tener 3 a 20 letras minúsculas, números o _",
    };
  }
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > 40) {
    return { ok: false, error: "El nombre debe tener entre 1 y 40 caracteres" };
  }
  if (!isValidTimezone(input.timezone)) {
    return { ok: false, error: "Zona horaria inválida" };
  }
  return { ok: true };
}
