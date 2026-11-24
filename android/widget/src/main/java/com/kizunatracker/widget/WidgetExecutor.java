package com.kizunatracker.widget;

import android.content.BroadcastReceiver;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs network work off the main thread while keeping the receiver alive (goAsync). The system gives a
 * receiver about 10 s; WidgetApi's timeouts (4 s connect + 5 s read, one call per broadcast) stay inside it.
 */
final class WidgetExecutor {
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    private WidgetExecutor() {}

    static void run(final BroadcastReceiver.PendingResult pending, final Runnable work) {
        EXEC.execute(new Runnable() {
            @Override public void run() {
                try {
                    work.run();
                } catch (RuntimeException ignored) {
                    // a widget must never crash its host process
                } finally {
                    if (pending != null) pending.finish();
                }
            }
        });
    }
}
