package com.kizunatracker.widget;

/** A 401 only revokes the token that earned it: a late answer for an old token must not wipe a freshly paired one. */
final class TokenGuard {
    private TokenGuard() {}

    static boolean shouldClear(String stored, String used) {
        return stored != null && used != null && stored.equals(used);
    }
}
