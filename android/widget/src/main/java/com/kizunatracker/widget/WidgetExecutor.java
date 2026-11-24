package com.kizunatracker.widget;

import android.content.BroadcastReceiver;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Runs network work off the main thread while keeping the receiver alive (goAsync).
 *
 * Bounded on purpose: the worker is a single thread, so on a dead network a pile of broadcasts could hold their
 * goAsync results for minutes. Each broadcast therefore gets a total budget (BroadcastBudget): a watchdog calls
 * finish() when it runs out, work that waited past its budget is skipped, and identical queued tasks coalesce.
 */
final class WidgetExecutor {
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor();
    private static final TaskCoalescer COALESCER = new TaskCoalescer();

    private WidgetExecutor() {}

    /** Unkeyed work (toggles): never coalesced, still bounded. */
    static void run(BroadcastReceiver.PendingResult pending, Runnable work) {
        run(null, pending, work);
    }

    /** With a key, an identical task already waiting makes this one redundant (it finishes right away). */
    static void run(final String coalesceKey, final BroadcastReceiver.PendingResult pending, final Runnable work) {
        final FinishOnce gate = new FinishOnce(new Runnable() {
            @Override public void run() {
                if (pending != null) pending.finish();
            }
        });
        if (coalesceKey != null && !COALESCER.offer(coalesceKey)) {
            gate.finish();
            return;
        }
        final BroadcastBudget budget = new BroadcastBudget(System.currentTimeMillis(), BroadcastBudget.DEFAULT_LIMIT_MILLIS);
        WATCHDOG.schedule(new Runnable() {
            @Override public void run() { gate.finish(); }
        }, budget.remaining(System.currentTimeMillis()), TimeUnit.MILLISECONDS);
        EXEC.execute(new Runnable() {
            @Override public void run() {
                if (coalesceKey != null) COALESCER.started(coalesceKey);
                try {
                    if (!budget.expired(System.currentTimeMillis())) work.run();
                } catch (RuntimeException ignored) {
                    // a widget must never crash its host process
                } finally {
                    gate.finish();
                }
            }
        });
    }
}
