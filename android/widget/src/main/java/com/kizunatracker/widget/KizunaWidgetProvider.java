package com.kizunatracker.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import java.io.IOException;
import java.util.TimeZone;

/** The "Hoy" home-screen widget. Cheap renders from cache first, then network on a background thread. */
public class KizunaWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.kizunatracker.widget.REFRESH";
    static final String ACTION_TOGGLE = "com.kizunatracker.widget.TOGGLE";
    static final String EXTRA_HABIT_ID = "habitId";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            refresh(context, goAsync());
        } else if (ACTION_TOGGLE.equals(action)) {
            toggle(context, intent.getStringExtra(EXTRA_HABIT_ID), goAsync());
        } else {
            super.onReceive(context, intent); // APPWIDGET_UPDATE / OPTIONS_CHANGED / ENABLED / DISABLED
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        refresh(context, goAsync());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        renderAll(context, new PayloadCache(context).load(new TokenStore(context).hasToken()));
    }

    @Override
    public void onEnabled(Context context) {
        RolloverScheduler.schedule(context, TimeZone.getDefault().getID());
    }

    @Override
    public void onDisabled(Context context) {
        RolloverScheduler.cancel(context);
    }

    // ---- flows -------------------------------------------------------------------------------------------

    private static void refresh(final Context context, final BroadcastReceiver.PendingResult pending) {
        final TokenStore tokens = new TokenStore(context);
        final PayloadCache cache = new PayloadCache(context);
        final String token = tokens.get();
        WidgetStateReducer.State s = cache.load(token != null);
        renderAll(context, s); // instant: whatever we have, never blocking on the network
        if (token == null) {
            if (pending != null) pending.finish();
            return;
        }
        final WidgetStateReducer.State start = s;
        WidgetExecutor.run("refresh", pending, new Runnable() {
            @Override public void run() {
                WidgetStateReducer.State next = start;
                try {
                    WidgetApi.Result r = new WidgetApi(context).today(token);
                    if (r.ok()) {
                        next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.loaded(PayloadParser.parse(r.body)));
                    } else if (r.status == 401) {
                        if (!tokens.clearIf(token)) return; // re-paired meanwhile: this 401 is about the old token
                        cache.clear();
                        next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.unauthorized());
                    } else {
                        next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.offline());
                    }
                } catch (PayloadParser.PayloadException e) {
                    // A newer server payload than this widget knows: keep the cache and say so (no crash).
                    next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.toggleFailed("", context.getString(R.string.kz_widget_update_app)));
                } catch (IOException e) {
                    next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.offline());
                }
                finish(context, cache, next);
            }
        });
    }

    private static void toggle(final Context context, final String habitId, final BroadcastReceiver.PendingResult pending) {
        final TokenStore tokens = new TokenStore(context);
        final PayloadCache cache = new PayloadCache(context);
        final String token = tokens.get();
        if (habitId == null || token == null) {
            renderAll(context, cache.load(false));
            if (pending != null) pending.finish();
            return;
        }
        final WidgetStateReducer.State start =
                WidgetStateReducer.reduce(cache.load(true), WidgetStateReducer.Event.toggleRequested(habitId));
        cache.save(start);
        renderAll(context, start); // optimistic: checked right now
        WidgetExecutor.run(pending, new Runnable() {
            @Override public void run() {
                WidgetStateReducer.State next;
                try {
                    WidgetApi.Result r = new WidgetApi(context).checkin(token, habitId);
                    if (r.ok()) {
                        next = WidgetStateReducer.reduce(start,
                                WidgetStateReducer.Event.toggleOk(habitId, PayloadParser.parseCheckin(r.body)));
                    } else if (r.status == 401) {
                        if (!tokens.clearIf(token)) return; // re-paired meanwhile: this 401 is about the old token
                        cache.clear();
                        next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.unauthorized());
                    } else if (r.status == 422) {
                        next = failed(context, start, habitId, R.string.kz_widget_err_open_app);
                    } else if (r.status == 429) {
                        next = failed(context, start, habitId, R.string.kz_widget_err_rate);
                    } else {
                        next = failed(context, start, habitId, R.string.kz_widget_err_toggle);
                    }
                } catch (PayloadParser.PayloadException e) {
                    // The check-in itself succeeded (2xx); only the echo was unreadable. Keep the tick.
                    next = WidgetStateReducer.reduce(start, WidgetStateReducer.Event.toggleOk(habitId, null));
                } catch (IOException e) {
                    next = failed(context, start, habitId, R.string.kz_widget_err_toggle);
                }
                finish(context, cache, next);
            }
        });
    }

    private static WidgetStateReducer.State failed(Context ctx, WidgetStateReducer.State s, String habitId, int msg) {
        return WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleFailed(habitId, ctx.getString(msg)));
    }

    private static void finish(Context context, PayloadCache cache, WidgetStateReducer.State s) {
        cache.save(s);
        renderAll(context, s);
        if (s.connected) {
            RolloverScheduler.schedule(context, s.payload != null ? s.payload.timeZone : TimeZone.getDefault().getID());
        }
    }

    // ---- rendering ---------------------------------------------------------------------------------------

    static void renderAll(Context context, WidgetStateReducer.State s) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, KizunaWidgetProvider.class));
        // The payload's zone defines "today" (same as Hoy on the web), so rollover follows the profile, not the phone.
        String tz = s.payload != null ? s.payload.timeZone : TimeZone.getDefault().getID();
        String today = RolloverClock.localDate(System.currentTimeMillis(), tz);
        for (int id : ids) {
            Bundle opts = manager.getAppWidgetOptions(id);
            int rows = WidgetRenderer.rowsFor(opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0));
            manager.updateAppWidget(id, WidgetRenderer.build(context, WidgetStateReducer.render(s, rows, today), rows));
        }
    }
}
