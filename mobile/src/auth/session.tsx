import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { SessionState } from "./gate";

type Value = { state: SessionState; session: Session | null };
const SessionContext = createContext<Value>({ state: { status: "loading" }, session: null });

/** The stored session (decrypted from MMKV) and its changes: sign-in, refresh, sign-out, a refresh rejected by the server. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Value>({ state: { status: "loading" }, session: null });

  useEffect(() => {
    const client = supabase();
    const apply = (session: Session | null) => setValue({ state: { status: session ? "signedIn" : "signedOut" }, session });
    void client.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
