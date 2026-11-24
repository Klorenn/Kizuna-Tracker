import { Eye, Flag } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/Button";

/** Friend profile primary action: "Retar" to the form, or "Ver reto" when a challenge with them is already open. */
export function RetarAction({ friendId, openChallengeId }: { friendId: string; openChallengeId: string | null }) {
  return openChallengeId ? (
    <ButtonLink href={`/retos/${openChallengeId}`} className="flex-1">
      <Eye size={20} weight="light" aria-hidden />
      Ver reto
    </ButtonLink>
  ) : (
    <ButtonLink href={`/retos/nuevo?amigo=${friendId}`} className="flex-1">
      <Flag size={20} weight="light" aria-hidden />
      Retar
    </ButtonLink>
  );
}
