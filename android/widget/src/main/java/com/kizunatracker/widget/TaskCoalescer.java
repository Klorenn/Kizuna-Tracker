package com.kizunatracker.widget;

import java.util.HashSet;
import java.util.Set;

/** At most one queued task per key: a burst of refreshes collapses into the one already waiting. */
final class TaskCoalescer {
    private final Set<String> queued = new HashSet<>();

    /** True when the task should be queued; false when an identical one is already waiting. */
    synchronized boolean offer(String key) {
        return queued.add(key);
    }

    /** The queued task began running: a new one may queue behind it. */
    synchronized void started(String key) {
        queued.remove(key);
    }
}
