package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class FinishOnceTest {
    @Test public void runsTheActionExactlyOnceAcrossWatchdogAndWorker() {
        final AtomicInteger n = new AtomicInteger();
        FinishOnce f = new FinishOnce(new Runnable() { @Override public void run() { n.incrementAndGet(); } });
        assertTrue(f.finish());   // the watchdog fires first
        assertFalse(f.finish());  // the worker finishes late: must not call PendingResult.finish() twice
        assertFalse(f.finish());
        assertEquals(1, n.get());
        assertTrue(f.isFinished());
    }

    @Test public void aNullActionIsANoOp() {
        FinishOnce f = new FinishOnce(null);
        assertTrue(f.finish());
        assertFalse(f.finish());
    }
}
