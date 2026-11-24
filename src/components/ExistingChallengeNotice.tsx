import { Warning } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { existingChallengeMessage } from "@/lib/challenge-form";

/** "Ya tienes un reto con @x" + a way to the existing one. Shown instead of letting a second be started blindly. */
export function ExistingChallengeNotice({ username, challengeId }: { username: string | null; challengeId: string | null }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-md bg-field px-4 py-3">
      <p className="flex items-start gap-[6px] text-body text-ink">
        <Warning size={16} weight="light" className="mt-[3px] shrink-0 text-alert" aria-hidden />
        {existingChallengeMessage(username)}
      </p>
      {challengeId ? (
        <Link href={`/retos/${challengeId}`} className="flex h-11 items-center text-[17px] font-medium text-accent">
          Ver reto
        </Link>
      ) : (
        <Link href="/retos" className="flex h-11 items-center text-[17px] font-medium text-accent">
          Ver mis retos
        </Link>
      )}
    </div>
  );
}
