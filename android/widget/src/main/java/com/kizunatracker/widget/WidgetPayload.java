package com.kizunatracker.widget;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Immutable snapshot of GET /api/widget/today (payload v1). Pure Java: no android.* here. */
public final class WidgetPayload {
    public static final int VERSION = 1;

    public static final class Habit {
        public static final String TOGGLE = "toggle";
        public static final String OPEN = "open";

        public final String id;
        public final String name;
        public final String kind;

        public Habit(String id, String name, String kind) {
            this.id = id;
            this.name = name;
            this.kind = TOGGLE.equals(kind) ? TOGGLE : OPEN; // unknown kinds degrade to "open in app"
        }

        public boolean isToggle() {
            return TOGGLE.equals(kind);
        }
    }

    /** User-local day, yyyy-MM-dd. */
    public final String date;
    public final String timeZone;
    public final int done;
    public final int total;
    /** Server-side pending count; can exceed habits.size() (the server caps the list). */
    public final int pending;
    public final List<Habit> habits;

    public WidgetPayload(String date, String timeZone, int done, int total, int pending, List<Habit> habits) {
        this.date = date;
        this.timeZone = timeZone;
        this.done = done;
        this.total = total;
        this.pending = pending;
        this.habits = Collections.unmodifiableList(new ArrayList<>(habits));
    }

    /** Local view after a check-in whose server re-read failed: the habit leaves the pending list. */
    public WidgetPayload withHabitDone(String habitId) {
        List<Habit> rest = new ArrayList<>();
        boolean found = false;
        for (Habit h : habits) {
            if (h.id.equals(habitId)) found = true;
            else rest.add(h);
        }
        if (!found) return this;
        return new WidgetPayload(date, timeZone, done + 1, total, Math.max(0, pending - 1), rest);
    }
}
