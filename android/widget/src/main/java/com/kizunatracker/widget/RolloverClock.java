package com.kizunatracker.widget;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/** Day-boundary maths on java.util.Calendar (java.time needs API 26; minSdk is 24). */
public final class RolloverClock {
    /** Land a minute after midnight so the server's own "today" has certainly flipped. */
    private static final long MARGIN_MILLIS = 60_000L;

    private RolloverClock() {}

    private static TimeZone zone(String tz) {
        // TimeZone.getTimeZone never throws: an unknown id yields GMT, which is a safe degradation.
        return TimeZone.getTimeZone(tz == null ? "UTC" : tz);
    }

    public static String localDate(long nowMillis, String tz) {
        Calendar c = Calendar.getInstance(zone(tz), Locale.ROOT);
        c.setTimeInMillis(nowMillis);
        return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    public static boolean isStale(String payloadDate, long nowMillis, String tz) {
        return payloadDate == null || !payloadDate.equals(localDate(nowMillis, tz));
    }

    /** Next local midnight (DST-aware) plus a one minute margin. Always in the future. */
    public static long nextRefreshMillis(long nowMillis, String tz) {
        Calendar c = Calendar.getInstance(zone(tz), Locale.ROOT);
        c.setTimeInMillis(nowMillis);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis() + MARGIN_MILLIS;
    }
}
