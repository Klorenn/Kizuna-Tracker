package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

public class RolloverClockTest {
    private static long utc(int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.clear();
        c.set(y, mo - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    @Test public void localDateFollowsTheTimeZone() {
        long now = utc(2026, 11, 24, 2, 30); // 02:30Z
        assertEquals("2026-11-23", RolloverClock.localDate(now, "America/Santiago")); // UTC-3 in Nov
        assertEquals("2026-11-24", RolloverClock.localDate(now, "UTC"));
        assertEquals("2026-11-24", RolloverClock.localDate(now, "Asia/Tokyo"));
    }

    @Test public void unknownTimeZoneFallsBackWithoutCrashing() {
        assertEquals(10, RolloverClock.localDate(utc(2026, 1, 5, 12, 0), "Not/AZone").length());
    }

    @Test public void staleWhenPayloadDateIsNotLocalToday() {
        long now = utc(2026, 11, 24, 12, 0);
        assertFalse(RolloverClock.isStale("2026-11-24", now, "UTC"));
        assertTrue(RolloverClock.isStale("2026-11-23", now, "UTC"));
        assertTrue(RolloverClock.isStale("2026-11-25", now, "UTC"));
        assertTrue(RolloverClock.isStale(null, now, "UTC"));
    }

    @Test public void nextRefreshIsLocalMidnightPlusOneMinute() {
        long now = utc(2026, 11, 24, 12, 0);
        assertEquals(utc(2026, 11, 25, 0, 1), RolloverClock.nextRefreshMillis(now, "UTC"));
        // Tokyo is UTC+9: 12:00Z is 21:00 local, so local midnight is 15:00Z.
        assertEquals(utc(2026, 11, 24, 15, 1), RolloverClock.nextRefreshMillis(now, "Asia/Tokyo"));
    }

    @Test public void justAfterMidnightTargetsTheNextDay() {
        long now = utc(2026, 11, 25, 0, 0); // exactly midnight UTC
        assertEquals(utc(2026, 11, 26, 0, 1), RolloverClock.nextRefreshMillis(now, "UTC"));
    }

    @Test public void springForwardDayIsShorterThan24h() {
        // New York 2026-03-08 loses 02:00-03:00. From 00:30 EST (05:30Z) the next midnight is Mar 9 00:00 EDT = 04:00Z.
        long now = utc(2026, 3, 8, 5, 30);
        assertEquals(utc(2026, 3, 9, 4, 1), RolloverClock.nextRefreshMillis(now, "America/New_York"));
    }

    @Test public void fallBackDayIsLongerThan24h() {
        // New York 2026-11-01 repeats 01:00-02:00. From Nov 1 00:30 EDT (04:30Z) the next midnight is Nov 2 00:00 EST = 05:00Z.
        long now = utc(2026, 11, 1, 4, 30);
        assertEquals(utc(2026, 11, 2, 5, 1), RolloverClock.nextRefreshMillis(now, "America/New_York"));
    }

    @Test public void alwaysInTheFuture() {
        long now = utc(2026, 6, 1, 23, 59);
        assertTrue(RolloverClock.nextRefreshMillis(now, "Europe/Madrid") > now);
    }
}
