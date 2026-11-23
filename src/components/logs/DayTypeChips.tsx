"use client";

import { Chip } from "@/components/ui/Chip";
import { DAY_TYPES, DAY_TYPE_LABEL, type DayType } from "@/domain/logs";

/** Multi-select of the day types (Pierna, Pecho...). Selection order is kept as tapped. */
export function DayTypeChips({
  value,
  onChange,
}: {
  value: DayType[];
  onChange: (next: DayType[]) => void;
}) {
  return (
    <div role="group" aria-label="Tipo de día" className="flex flex-wrap gap-2">
      {DAY_TYPES.map((type) => {
        const selected = value.includes(type);
        return (
          <Chip
            key={type}
            selected={selected}
            onClick={() => onChange(selected ? value.filter((t) => t !== type) : [...value, type])}
          >
            {DAY_TYPE_LABEL[type]}
          </Chip>
        );
      })}
    </div>
  );
}
