package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BroadcastBudgetTest {
    @Test public void notExpiredInsideTheBudget() {
        BroadcastBudget b = new BroadcastBudget(1_000, 20_000);
        assertFalse(b.expired(1_000));
        assertFalse(b.expired(20_999));
        assertEquals(19_000, b.remaining(2_000));
    }

    @Test public void expiredAtAndAfterTheLimit() {
        BroadcastBudget b = new BroadcastBudget(1_000, 20_000);
        assertTrue(b.expired(21_000));
        assertTrue(b.expired(99_000));
        assertEquals(0, b.remaining(99_000));
    }

    @Test public void clockGoingBackwardsDoesNotExtendTheBudgetBeyondTheLimit() {
        BroadcastBudget b = new BroadcastBudget(10_000, 20_000);
        assertEquals(20_000, b.remaining(5_000));
    }

    @Test public void defaultBudgetIsTwentySeconds() {
        assertEquals(20_000L, BroadcastBudget.DEFAULT_LIMIT_MILLIS);
    }
}
