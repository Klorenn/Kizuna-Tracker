import "server-only";
import { localDate } from "@/domain/dates";
import { buildToday } from "@/domain/today";
import { buildWidgetPayload } from "@/domain/widget-payload";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthResult, PairResult, WidgetDeps } from "@/lib/widget-api";

type Admin = ReturnType<typeof createAdminClient>;
type Fns = Database["public"]["Functions"];
type RpcAnswer = { data: unknown; error: { message: string } | null };

/**
 * Every widget_* function is service-role only, so this is the one module that calls them (with the admin client, which
 * never reaches a client component). Generated argument names are checked; any argument may be null (the generator marks
 * them all non-null, and `p_ip_key` / `p_previous_token_hash` really are nullable in SQL).
 */
function call<F extends keyof Fns>(admin: Admin, fn: F, args: { [K in keyof Fns[F]["Args"]]: Fns[F]["Args"][K] | null }): PromiseLike<RpcAnswer> {
  const rpc = admin.rpc as (fn: string, args: Record<string, unknown>) => PromiseLike<RpcAnswer>;
  return rpc.call(admin, fn, args);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function mapAuth(data: unknown): AuthResult {
  if (!isRecord(data)) throw new Error("widget_auth: unexpected answer");
  if (data.status === "invalid" || data.status === "limited") return { status: data.status };
  if (data.status === "ok" && typeof data.user_id === "string" && typeof data.token_id === "string" && typeof data.time_zone === "string") {
    return { status: "ok", userId: data.user_id, tokenId: data.token_id, timeZone: data.time_zone };
  }
  throw new Error("widget_auth: unexpected answer");
}

function mapPair(data: unknown): PairResult {
  if (!isRecord(data)) throw new Error("widget_pair: unexpected answer");
  if (data.status === "invalid" || data.status === "limited" || data.status === "limit_reached") return { status: data.status };
  if (data.status === "ok" && typeof data.username === "string") return { status: "ok", username: data.username };
  throw new Error("widget_pair: unexpected answer");
}

/**
 * The service-role adapter of the widget API. `loadToday` is a slim Hoy read (habits, steps and today's check-ins, three
 * reads in one round trip, all filtered by `user_id` because the service role bypasses RLS); streaks are not needed, so
 * no history is read.
 */
export function supabaseWidgetDeps(admin: Admin = createAdminClient(), now: () => Date = () => new Date()): WidgetDeps {
  return {
    async auth({ tokenHash, ipKey, scope }) {
      const { data, error } = await call(admin, "widget_auth", { p_token_hash: tokenHash, p_ip_key: ipKey, p_scope: scope });
      if (error) throw new Error(error.message);
      return mapAuth(data);
    },
    async pair({ code, tokenHash, label, previousTokenHash, ipKey }) {
      const { data, error } = await call(admin, "widget_pair", {
        p_code: code,
        p_token_hash: tokenHash,
        p_label: label,
        p_previous_token_hash: previousTokenHash,
        p_ip_key: ipKey,
      });
      if (error) throw new Error(error.message);
      return mapPair(data);
    },
    async loadToday(userId, timeZone) {
      const today = localDate(now(), timeZone);
      const [habits, items, checkins] = await Promise.all([
        admin
          .from("habits")
          .select("id,name,icon,color,visibility,requires_photo,frequency_type,target_per_week,preset,log_type,quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml")
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("created_at"),
        admin.from("habit_items").select("id,habit_id,label,position,requires_photo").eq("user_id", userId).is("archived_at", null),
        admin.from("checkins").select("habit_id").eq("user_id", userId).eq("local_date", today),
      ]);
      if (habits.error || items.error || checkins.error) return null;
      const view = buildToday({
        habits: habits.data ?? [],
        items: items.data ?? [],
        checkins: (checkins.data ?? []).map((c) => ({ habit_id: c.habit_id, local_date: today })),
        itemChecks: [],
        today,
        timeZone,
      });
      return buildWidgetPayload(view, today, timeZone);
    },
    async checkin(userId, habitId) {
      const { data, error } = await call(admin, "widget_create_checkin", { p_user_id: userId, p_habit_id: habitId });
      if (error) return { ok: false, message: error.message };
      const row = Array.isArray(data) ? data[0] : null;
      if (!isRecord(row) || typeof row.created !== "boolean") return { ok: false, message: "unexpected_answer" };
      return { ok: true, created: row.created };
    },
  };
}
