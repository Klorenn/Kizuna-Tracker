package com.kizunatracker.widget;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TokenGuardTest {
    @Test public void clearsWhenTheStoredTokenIsTheOneThatGotThe401() {
        assertTrue(TokenGuard.shouldClear("kzw_old", "kzw_old"));
    }

    @Test public void keepsANewlyPairedTokenWhenAStale401ArrivesForTheOldOne() {
        assertFalse(TokenGuard.shouldClear("kzw_new", "kzw_old"));
    }

    @Test public void nothingStoredNothingToClear() {
        assertFalse(TokenGuard.shouldClear(null, "kzw_old"));
    }

    @Test public void nullUsedTokenNeverClears() {
        assertFalse(TokenGuard.shouldClear("kzw_new", null));
        assertFalse(TokenGuard.shouldClear(null, null));
    }
}
