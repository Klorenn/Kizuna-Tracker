package com.kizunatracker.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** One inexact alarm at the next local midnight. AlarmManager.set needs no permission and may drift a little. */
final class RolloverScheduler {
    private RolloverScheduler() {}

    private static PendingIntent intent(Context ctx) {
        Intent i = new Intent(ctx, KizunaWidgetProvider.class).setAction(KizunaWidgetProvider.ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 7, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context ctx, String timeZone) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.set(AlarmManager.RTC, RolloverClock.nextRefreshMillis(System.currentTimeMillis(), timeZone), intent(ctx));
    }

    static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(intent(ctx));
    }
}
