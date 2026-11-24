package com.kizunatracker.widget;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/** RenderModel -> RemoteViews. All the decisions were made by WidgetStateReducer; this only paints. */
final class WidgetRenderer {
    private static final int FLAGS = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
    private static final int[] ROW = {R.id.kz_row0, R.id.kz_row1, R.id.kz_row2, R.id.kz_row3};
    private static final int[] CHECK = {R.id.kz_check0, R.id.kz_check1, R.id.kz_check2, R.id.kz_check3};
    private static final int[] NAME = {R.id.kz_name0, R.id.kz_name1, R.id.kz_name2, R.id.kz_name3};

    /** Launchers report heights in dp; below this only two rows fit without clipping. */
    private static final int COMPACT_BELOW_DP = 180;

    private WidgetRenderer() {}

    static int rowsFor(int minHeightDp) {
        return minHeightDp > 0 && minHeightDp < COMPACT_BELOW_DP ? 2 : 4;
    }

    static RemoteViews build(Context ctx, RenderModel m, int maxRows) {
        switch (m.kind) {
            case UNCONNECTED: return message(ctx, R.layout.kz_widget_unconnected, setupIntent(ctx));
            case LOADING: return simple(ctx, R.layout.kz_widget_loading, openIntent(ctx, "/", 1));
            case OFFLINE_EMPTY: {
                RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.kz_widget_loading);
                v.setTextViewText(R.id.kz_loading_text, ctx.getString(R.string.kz_widget_offline_empty));
                v.setOnClickPendingIntent(R.id.kz_root, refreshIntent(ctx));
                return v;
            }
            default: return list(ctx, m, maxRows);
        }
    }

    private static RemoteViews simple(Context ctx, int layout, PendingIntent click) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        v.setOnClickPendingIntent(R.id.kz_root, click);
        return v;
    }

    private static RemoteViews message(Context ctx, int layout, PendingIntent click) {
        return simple(ctx, layout, click);
    }

    private static RemoteViews list(Context ctx, RenderModel m, int maxRows) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.kz_widget);
        v.setOnClickPendingIntent(R.id.kz_header, headerIntent(ctx));
        v.setTextViewText(R.id.kz_count, m.total > 0 ? m.done + "/" + m.total : "");

        String status = m.error != null ? m.error : (m.stale ? ctx.getString(R.string.kz_widget_stale) : null);
        v.setViewVisibility(R.id.kz_status, status == null ? View.GONE : View.VISIBLE);
        if (status != null) v.setTextViewText(R.id.kz_status, status);

        for (int i = 0; i < ROW.length; i++) {
            if (i >= maxRows || i >= m.rows.size()) {
                v.setViewVisibility(ROW[i], View.GONE);
                continue;
            }
            RenderModel.Row r = m.rows.get(i);
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(NAME[i], r.name);
            v.setViewVisibility(CHECK[i], r.showCheckbox ? View.VISIBLE : View.GONE);
            v.setImageViewResource(CHECK[i], r.checked ? R.drawable.kz_check_done : R.drawable.kz_check_empty);
            v.setOnClickPendingIntent(ROW[i], r.showCheckbox && !r.checked ? toggleIntent(ctx, r.id) : openIntent(ctx, "/", 10 + i));
        }

        String footer = null;
        if (m.kind == RenderModel.Kind.ALL_DONE) footer = ctx.getString(R.string.kz_widget_all_done);
        else if (m.kind == RenderModel.Kind.EMPTY) footer = ctx.getString(R.string.kz_widget_empty);
        else if (m.moreCount > 0) footer = ctx.getString(R.string.kz_widget_more, m.moreCount);
        v.setViewVisibility(R.id.kz_footer, footer == null ? View.GONE : View.VISIBLE);
        if (footer != null) {
            v.setTextViewText(R.id.kz_footer, footer);
            v.setOnClickPendingIntent(R.id.kz_footer, openIntent(ctx, "/", 20));
        }
        return v;
    }

    private static PendingIntent headerIntent(Context ctx) {
        return openIntent(ctx, "/", 2);
    }

    private static PendingIntent refreshIntent(Context ctx) {
        Intent i = new Intent(ctx, KizunaWidgetProvider.class).setAction(KizunaWidgetProvider.ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 3, i, FLAGS);
    }

    /** Opens Hoy (or the given path) in the TWA and refreshes the widget. */
    private static PendingIntent openIntent(Context ctx, String path, int requestCode) {
        Intent i = new Intent(ctx, WidgetOpenActivity.class).putExtra(WidgetOpenActivity.EXTRA_PATH, path);
        i.setData(Uri.parse("kizuna-widget://open/" + requestCode));
        return PendingIntent.getActivity(ctx, requestCode, i, FLAGS);
    }

    private static PendingIntent setupIntent(Context ctx) {
        Intent i = new Intent(ctx, WidgetSetupActivity.class);
        return PendingIntent.getActivity(ctx, 4, i, FLAGS);
    }

    /** One PendingIntent per habit: the data URI keeps them distinct (extras do not count for equality). */
    private static PendingIntent toggleIntent(Context ctx, String habitId) {
        Intent i = new Intent(ctx, KizunaWidgetProvider.class)
                .setAction(KizunaWidgetProvider.ACTION_TOGGLE)
                .setData(Uri.parse("kizuna-widget://toggle/" + Uri.encode(habitId)))
                .putExtra(KizunaWidgetProvider.EXTRA_HABIT_ID, habitId);
        return PendingIntent.getBroadcast(ctx, 5, i, FLAGS);
    }
}
