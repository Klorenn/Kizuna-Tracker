package com.kizunatracker.widget;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TaskCoalescerTest {
    @Test public void aSecondQueuedRefreshIsDropped() {
        TaskCoalescer c = new TaskCoalescer();
        assertTrue(c.offer("refresh"));
        assertFalse(c.offer("refresh"));
        assertFalse(c.offer("refresh"));
    }

    @Test public void onceTheQueuedOneStartsANewOneIsAccepted() {
        TaskCoalescer c = new TaskCoalescer();
        assertTrue(c.offer("refresh"));
        c.started("refresh");
        assertTrue(c.offer("refresh"));
    }

    @Test public void keysAreIndependent() {
        TaskCoalescer c = new TaskCoalescer();
        assertTrue(c.offer("refresh"));
        assertTrue(c.offer("toggle:a"));
        assertTrue(c.offer("toggle:b"));
        assertFalse(c.offer("toggle:a"));
    }

    @Test public void startedOnAnUnknownKeyIsHarmless() {
        new TaskCoalescer().started("nope");
    }
}
