import type { Metadata } from "next";
import Link from "next/link";
import { KanjiWatermark } from "@/components/auth/KanjiWatermark";
import { CatLift } from "@/components/brand/CatLift";
import { Lockup } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Bienvenida" };

/** Figma A0 Bienvenida (820:2305). */
export default function BienvenidaPage() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-[clamp(40px,10dvh,96px)]">
      <KanjiWatermark placement="middle" />
      <section className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-3">
          <Lockup cat={<CatLift width={172} />} />
          <p className="text-small text-muted">
            <span lang="ja">絆</span>, <i>kizuna</i>: el lazo entre amigos.
          </p>
        </div>
        <h1 className="mt-2 text-title font-semibold text-balance text-ink">
          Rachas y retos con tus amigos.
        </h1>
        <p className="text-body text-pretty text-muted">
          Marca tus hábitos, sube una foto cuando toca y lleva la cuenta de las
          multas entre amigos.
        </p>
      </section>
      <div className="mt-auto flex flex-col gap-3 pt-10">
        <ButtonLink href="/registro">Crear cuenta</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Ya tengo cuenta
        </ButtonLink>
        <p className="text-center text-small text-balance text-muted">
          Al continuar aceptas los{" "}
          <Link href="/legal/terminos" className="text-accent underline underline-offset-2">
            Términos de uso
          </Link>{" "}
          y la{" "}
          <Link href="/legal/privacidad" className="text-accent underline underline-offset-2">
            Política de privacidad
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
