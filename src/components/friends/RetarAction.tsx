import { Eye, Flag, Plus } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Friend profile primary action: "Agregar sub-reto" when an open challenge with them accepts one, "Ver reto" when
 * it is open but this viewer cannot add to it, "Retar" otherwise.
 */
export function RetarAction({
  friendId,
  openChallenge,
}: {
  friendId: string;
  openChallenge: { id: string; canAdd: boolean } | null;
}) {
  if (openChallenge?.canAdd) {
    return (
      <ButtonLink href={`/retos/nuevo?reto=${openChallenge.id}`} className="flex-1">
        <Plus size={20} weight="light" aria-hidden />
        Agregar sub-reto
      </ButtonLink>
    );
  }
  if (openChallenge) {
    return (
      <ButtonLink href={`/retos/${openChallenge.id}`} className="flex-1">
        <Eye size={20} weight="light" aria-hidden />
        Ver reto
      </ButtonLink>
    );
  }
  return (
    <ButtonLink href={`/retos/nuevo?amigo=${friendId}`} className="flex-1">
      <Flag size={20} weight="light" aria-hidden />
      Retar
    </ButtonLink>
  );
}
