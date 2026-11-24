import { useEffect } from "react";
import { usePushLinks, type LinksApi } from "./use-push-links";
import { pushRegistrar } from "./wiring";

type Props = { registrar?: Pick<typeof pushRegistrar, "sync" | "watchRotation">; linksApi?: LinksApi };

/**
 * Mounted once the session gate has passed: registers this device for push when the permission is already granted (it never
 * prompts: the Hoy banner does, in context), keeps the token fresh, and routes taps on a push. Renders nothing.
 */
export function PushBridge({ registrar = pushRegistrar, linksApi }: Props) {
  usePushLinks(linksApi);
  useEffect(() => {
    void registrar.sync();
    return registrar.watchRotation();
  }, [registrar]);
  return null;
}
