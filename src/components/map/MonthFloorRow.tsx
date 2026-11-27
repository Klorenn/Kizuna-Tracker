import { MapTrifold } from "@phosphor-icons/react/dist/ssr";
import { LoadFailed } from "@/components/LoadFailed";
import { ListCard, ListRow } from "@/components/ui/ListRow";
import { monthRowValue } from "@/domain/outings";

export function monthFloorRowModel(
  read: { ok: true; completed: number } | { ok: false },
): { kind: "error" } | { kind: "link"; label: "Este mes"; value: string; href: "/mapa" } {
  const value = monthRowValue(read);
  if (value === null) return { kind: "error" };
  return { kind: "link", label: "Este mes", value, href: "/mapa" };
}

export function MonthFloorRow({ read }: { read: { ok: true; completed: number } | { ok: false } }) {
  const model = monthFloorRowModel(read);
  if (model.kind === "error") return <LoadFailed href="/mapa" />;
  return (
    <ListCard>
      <ListRow href={model.href} icon={<MapTrifold size={20} weight="light" />} label={model.label} value={model.value} mono chevron />
    </ListCard>
  );
}
