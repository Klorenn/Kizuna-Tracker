import { unstable_rethrow } from "next/navigation";

export const CONNECTION_ERROR = "No pudimos conectar. Inténtalo de nuevo en unos minutos.";

/**
 * Runs a server action from a client handler. Only genuine failures (network, thrown
 * errors) become the connection message; Next's control-flow errors, such as the
 * redirect a successful action throws, are rethrown untouched. Result objects
 * (validation, wrong credentials) are returned as the value, with their own messages.
 */
export async function safeAction<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: CONNECTION_ERROR };
  }
}
