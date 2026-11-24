import { randomUUID } from "expo-crypto";

/** A client-generated id, the idempotency key of a tracked mutation. */
export const newClientId = (): string => randomUUID();
