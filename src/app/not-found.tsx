import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="text-title font-semibold text-ink">Esta página no existe</h1>
      <p className="text-body text-muted">El enlace está mal o la página se movió.</p>
      <Link href="/" className="inline-flex h-11 items-center text-body font-medium text-accent">
        Volver al inicio
      </Link>
    </main>
  );
}
