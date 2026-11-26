import { parseIdentifier } from "@/lib/login";

export const RESET_SENT =
  "Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva. Revisa también el spam.";

export const RESET_INVALID = "Escribe el correo o el @usuario de tu cuenta.";

export type ResetPlan =
  | { kind: "invalid" }
  | { kind: "lookup"; id: { kind: "email" | "username"; value: string } };

/** Invalid shape is the only reply that differs. A real lookup never says whether the account exists. */
export function planPasswordReset(raw: string): ResetPlan {
  if (typeof raw !== "string" || raw.length > 320) return { kind: "invalid" };
  const id = parseIdentifier(raw);
  if (id.kind === "invalid") return { kind: "invalid" };
  return {
    kind: "lookup",
    id: { kind: id.kind, value: id.kind === "email" ? id.email : id.username },
  };
}
