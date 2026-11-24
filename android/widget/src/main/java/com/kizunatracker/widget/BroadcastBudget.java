package com.kizunatracker.widget;

/** Total time one broadcast may hold goAsync. Pure: callers pass the clock. */
final class BroadcastBudget {
    /** The system gives a receiver ~10 s of normal life; goAsync can stretch further but must not be abused. */
    static final long DEFAULT_LIMIT_MILLIS = 20_000L;

    private final long start;
    private final long limit;

    BroadcastBudget(long startMillis, long limitMillis) {
        this.start = startMillis;
        this.limit = limitMillis;
    }

    boolean expired(long nowMillis) {
        return nowMillis - start >= limit;
    }

    long remaining(long nowMillis) {
        long left = limit - Math.max(0, nowMillis - start);
        return Math.max(0, left);
    }
}
