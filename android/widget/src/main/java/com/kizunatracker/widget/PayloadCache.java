package com.kizunatracker.widget;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Last good payload and in-flight optimistic ticks, so the widget can render without the network. */
final class PayloadCache {
    private static final String PREFS = "kizuna_widget_cache";
    private static final String KEY_PAYLOAD = "payload";
    private static final String KEY_OPTIMISTIC = "optimistic";
    private static final String KEY_ERROR = "error";
    private static final String KEY_OFFLINE = "offline";

    private final SharedPreferences prefs;

    PayloadCache(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    WidgetStateReducer.State load(boolean connected) {
        if (!connected) return WidgetStateReducer.State.unconnected();
        WidgetPayload payload = null;
        String raw = prefs.getString(KEY_PAYLOAD, null);
        if (raw != null) {
            try {
                payload = PayloadParser.parse(raw);
            } catch (PayloadParser.PayloadException e) {
                prefs.edit().remove(KEY_PAYLOAD).apply(); // corrupted or from a future version: drop it
            }
        }
        Set<String> optimistic = new HashSet<>(prefs.getStringSet(KEY_OPTIMISTIC, Collections.<String>emptySet()));
        return WidgetStateReducer.State.of(true, payload, optimistic, prefs.getString(KEY_ERROR, null), prefs.getBoolean(KEY_OFFLINE, false));
    }

    void save(WidgetStateReducer.State s) {
        SharedPreferences.Editor e = prefs.edit();
        if (s.payload == null) e.remove(KEY_PAYLOAD);
        else e.putString(KEY_PAYLOAD, toJson(s.payload));
        e.putStringSet(KEY_OPTIMISTIC, new HashSet<>(s.optimistic));
        if (s.error == null) e.remove(KEY_ERROR);
        else e.putString(KEY_ERROR, s.error);
        e.putBoolean(KEY_OFFLINE, s.offline);
        e.apply();
    }

    void clear() {
        prefs.edit().clear().apply();
    }

    static String toJson(WidgetPayload p) {
        try {
            JSONArray habits = new JSONArray();
            for (WidgetPayload.Habit h : p.habits) {
                habits.put(new JSONObject().put("id", h.id).put("name", h.name).put("kind", h.kind));
            }
            return new JSONObject()
                    .put("v", WidgetPayload.VERSION)
                    .put("date", p.date)
                    .put("timeZone", p.timeZone)
                    .put("done", p.done)
                    .put("total", p.total)
                    .put("pending", p.pending)
                    .put("habits", habits)
                    .toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }
}
