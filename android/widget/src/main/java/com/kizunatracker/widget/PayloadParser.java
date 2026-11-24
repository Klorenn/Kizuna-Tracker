package com.kizunatracker.widget;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Strict parsing of the widget API responses. Anything unexpected is a PayloadException, never a crash. */
public final class PayloadParser {
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private PayloadParser() {}

    public static final class PayloadException extends Exception {
        /** True when the server speaks a newer payload version than this widget understands. */
        public final boolean unsupportedVersion;

        PayloadException(String message, boolean unsupportedVersion) {
            super(message);
            this.unsupportedVersion = unsupportedVersion;
        }
    }

    public static final class PairResult {
        public final String token;
        public final String username;

        PairResult(String token, String username) {
            this.token = token;
            this.username = username;
        }
    }

    public static WidgetPayload parse(String json) throws PayloadException {
        if (json == null) throw new PayloadException("empty body", false);
        try {
            return fromObject(new JSONObject(json));
        } catch (JSONException e) {
            throw new PayloadException("malformed payload: " + e.getMessage(), false);
        }
    }

    /** {created, today: Payload|null}. A null/missing today means the re-read failed: the caller keeps its local tick. */
    public static WidgetPayload parseCheckin(String json) throws PayloadException {
        if (json == null) throw new PayloadException("empty body", false);
        try {
            JSONObject o = new JSONObject(json);
            if (o.isNull("today")) return null;
            return fromObject(o.getJSONObject("today"));
        } catch (JSONException e) {
            throw new PayloadException("malformed check-in response: " + e.getMessage(), false);
        }
    }

    public static PairResult parsePair(String json) throws PayloadException {
        if (json == null) throw new PayloadException("empty body", false);
        try {
            JSONObject o = new JSONObject(json);
            String token = o.getString("token");
            if (token.isEmpty()) throw new PayloadException("empty token", false);
            return new PairResult(token, o.optString("username", ""));
        } catch (JSONException e) {
            throw new PayloadException("malformed pair response: " + e.getMessage(), false);
        }
    }

    private static WidgetPayload fromObject(JSONObject o) throws JSONException, PayloadException {
        int v = o.getInt("v");
        if (v != WidgetPayload.VERSION) throw new PayloadException("unsupported payload version " + v, true);
        String date = o.getString("date");
        if (!DATE.matcher(date).matches()) throw new PayloadException("bad date " + date, false);
        String tz = o.getString("timeZone");
        int done = strictInt(o, "done");
        int total = strictInt(o, "total");
        int pending = strictInt(o, "pending");
        JSONArray arr = o.getJSONArray("habits");
        List<WidgetPayload.Habit> habits = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject h = arr.getJSONObject(i);
            habits.add(new WidgetPayload.Habit(h.getString("id"), h.getString("name"), h.optString("kind", WidgetPayload.Habit.OPEN)));
        }
        return new WidgetPayload(date, tz, done, total, pending, habits);
    }

    /** org.json coerces "3" to 3; the contract says numbers, so reject strings. */
    private static int strictInt(JSONObject o, String key) throws JSONException, PayloadException {
        Object val = o.get(key);
        if (!(val instanceof Number)) throw new PayloadException(key + " is not a number", false);
        return ((Number) val).intValue();
    }
}
