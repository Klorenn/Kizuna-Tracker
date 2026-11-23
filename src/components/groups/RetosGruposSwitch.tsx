import Link from "next/link";

/**
 * Props: { current: "retos" | "grupos" }.
 * Two links styled as the app's segmented control. Both states share the same box (the selected one
 * only changes colour and shadow), so the switch can sit on /retos and /grupos without shifting.
 */
export function RetosGruposSwitch({ current }: { current: "retos" | "grupos" }) {
  const options = [
    { key: "retos", label: "Retos", href: "/retos" },
    { key: "grupos", label: "Grupos", href: "/grupos" },
  ] as const;
  return (
    <nav aria-label="Retos y grupos" className="flex gap-1 rounded-md bg-field p-1">
      {options.map((o) => {
        const selected = o.key === current;
        return (
          <Link
            key={o.key}
            href={o.href}
            aria-current={selected ? "page" : undefined}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-md px-3 text-body font-medium transition-colors duration-[120ms] motion-reduce:transition-none ${
              selected ? "bg-raised text-ink shadow-card" : "text-muted"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
