package com.kizunatracker.widget;

import java.util.concurrent.atomic.AtomicBoolean;

/** PendingResult.finish() must run exactly once; both the worker and the deadline watchdog may try. */
final class FinishOnce {
    private final AtomicBoolean done = new AtomicBoolean(false);
    private final Runnable action;

    FinishOnce(Runnable action) {
        this.action = action;
    }

    /** True for the caller that actually finished. */
    boolean finish() {
        if (!done.compareAndSet(false, true)) return false;
        if (action != null) action.run();
        return true;
    }

    boolean isFinished() {
        return done.get();
    }
}
