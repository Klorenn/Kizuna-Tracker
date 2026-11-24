import { Redirect, Stack } from "expo-router";
import { gateTarget } from "../../src/auth/gate";
import { useSession } from "../../src/auth/session";

/** The auth gate: nothing under (app) renders without a session. */
export default function AppLayout() {
  const { state } = useSession();
  const target = gateTarget(state, "app");
  if (target === "wait") return null;
  if (target === "/login") return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
