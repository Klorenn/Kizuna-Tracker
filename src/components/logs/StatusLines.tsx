/**
 * The status lines under the readout, one paragraph each, in order. `reserve` keeps a second line's
 * height even while it is empty (a no-break space), so a status that appears later (pending, then
 * confirmed) moves nothing.
 */
export function StatusLines({ lines, reserve = false }: { lines: string[]; reserve?: boolean }) {
  const shown = reserve && lines.length < 2 ? [...lines, " "] : lines;
  return (
    <>
      {shown.map((l, i) => (
        <p key={i} className={`text-small text-pretty text-ink ${reserve && i === 1 ? "min-h-5" : ""}`}>
          {l}
        </p>
      ))}
    </>
  );
}
