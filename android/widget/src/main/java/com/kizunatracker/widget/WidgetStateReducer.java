package com.kizunatracker.widget;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** (State, Event) -> State, plus State -> RenderModel. Pure Java so it runs under JUnit. */
public final class WidgetStateReducer {
    private WidgetStateReducer() {}

    public static final class State {
        public final boolean connected;
        public final WidgetPayload payload;
        /** Habit ids ticked locally and not yet confirmed by the server. */
        public final Set<String> optimistic;
        public final String error;
        public final boolean offline;

        private State(boolean connected, WidgetPayload payload, Set<String> optimistic, String error, boolean offline) {
            this.connected = connected;
            this.payload = payload;
            this.optimistic = Collections.unmodifiableSet(new HashSet<>(optimistic));
            this.error = error;
            this.offline = offline;
        }

        public static State unconnected() {
            return new State(false, null, Collections.<String>emptySet(), null, false);
        }

        public static State connected() {
            return new State(true, null, Collections.<String>emptySet(), null, false);
        }

        public static State of(boolean connected, WidgetPayload payload, Set<String> optimistic, String error, boolean offline) {
            return new State(connected, payload, optimistic, error, offline);
        }
    }

    public static final class Event {
        enum Type { LOADED, TOGGLE_REQUESTED, TOGGLE_OK, TOGGLE_FAILED, UNAUTHORIZED, OFFLINE, ROLLOVER }

        final Type type;
        final WidgetPayload payload;
        final String habitId;
        final String message;

        private Event(Type type, WidgetPayload payload, String habitId, String message) {
            this.type = type;
            this.payload = payload;
            this.habitId = habitId;
            this.message = message;
        }

        public static Event loaded(WidgetPayload p) { return new Event(Type.LOADED, p, null, null); }
        public static Event toggleRequested(String id) { return new Event(Type.TOGGLE_REQUESTED, null, id, null); }
        /** payload may be null when the server's re-read failed after a successful check-in. */
        public static Event toggleOk(String id, WidgetPayload p) { return new Event(Type.TOGGLE_OK, p, id, null); }
        public static Event toggleFailed(String id, String message) { return new Event(Type.TOGGLE_FAILED, null, id, message); }
        public static Event unauthorized() { return new Event(Type.UNAUTHORIZED, null, null, null); }
        public static Event offline() { return new Event(Type.OFFLINE, null, null, null); }
        public static Event rollover() { return new Event(Type.ROLLOVER, null, null, null); }
    }

    public static State reduce(State s, Event e) {
        switch (e.type) {
            case LOADED:
                // A fresh server view supersedes every optimistic tick (and clears offline/error marks).
                return State.of(true, e.payload, Collections.<String>emptySet(), null, false);
            case TOGGLE_REQUESTED: {
                if (!s.connected || s.payload == null) return s;
                boolean tickable = false;
                for (WidgetPayload.Habit h : s.payload.habits) {
                    if (h.id.equals(e.habitId) && h.isToggle()) tickable = true;
                }
                if (!tickable) return s;
                Set<String> next = new HashSet<>(s.optimistic);
                next.add(e.habitId);
                return State.of(true, s.payload, next, null, s.offline);
            }
            case TOGGLE_OK: {
                Set<String> next = new HashSet<>(s.optimistic);
                next.remove(e.habitId);
                WidgetPayload p = e.payload != null ? e.payload : (s.payload == null ? null : s.payload.withHabitDone(e.habitId));
                return State.of(true, p, next, null, false);
            }
            case TOGGLE_FAILED: {
                Set<String> next = new HashSet<>(s.optimistic);
                next.remove(e.habitId);
                return State.of(s.connected, s.payload, next, e.message, s.offline);
            }
            case UNAUTHORIZED:
                return State.unconnected();
            case OFFLINE:
                return State.of(s.connected, s.payload, s.optimistic, s.error, true);
            case ROLLOVER:
                return State.of(s.connected, s.payload, Collections.<String>emptySet(), null, s.offline);
            default:
                return s;
        }
    }

    public static RenderModel render(State s, int maxRows, String localToday) {
        if (!s.connected) return RenderModel.of(RenderModel.Kind.UNCONNECTED);
        WidgetPayload p = s.payload;
        // Yesterday's list must never pass as today's (R-W11).
        if (p == null || !p.date.equals(localToday)) {
            return RenderModel.of(s.offline ? RenderModel.Kind.OFFLINE_EMPTY : RenderModel.Kind.LOADING);
        }
        int ticked = 0;
        List<RenderModel.Row> rows = new ArrayList<>();
        for (WidgetPayload.Habit h : p.habits) {
            boolean checked = h.isToggle() && s.optimistic.contains(h.id);
            if (checked) ticked++;
            if (rows.size() < maxRows) rows.add(new RenderModel.Row(h.id, h.name, h.isToggle(), checked));
        }
        int done = p.done + ticked;
        int pending = Math.max(0, p.pending - ticked);
        int more = Math.max(0, p.pending - rows.size());
        if (p.total == 0) {
            return new RenderModel(RenderModel.Kind.EMPTY, 0, 0, rows, 0, s.offline, s.error);
        }
        if (pending == 0) {
            return new RenderModel(RenderModel.Kind.ALL_DONE, done, p.total, Collections.<RenderModel.Row>emptyList(), 0, s.offline, s.error);
        }
        return new RenderModel(RenderModel.Kind.LIST, done, p.total, rows, more, s.offline, s.error);
    }
}
