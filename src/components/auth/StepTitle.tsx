/** Título de paso (Inter 600, -2 %) con una línea de apoyo en muted. */
export function StepTitle({
  title,
  subtitle,
  id,
}: {
  title: string;
  subtitle?: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 id={id} className="text-heading font-semibold text-balance text-ink">
        {title}
      </h1>
      {subtitle ? <p className="text-body text-pretty text-muted">{subtitle}</p> : null}
    </div>
  );
}
