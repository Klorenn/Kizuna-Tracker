package com.kizunatracker.widget;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** What the renderer must draw, with every decision already made. Pure Java. */
public final class RenderModel {
    public enum Kind { UNCONNECTED, LOADING, LIST, ALL_DONE, EMPTY, OFFLINE_EMPTY }

    public static final class Row {
        public final String id;
        public final String name;
        /** Only toggle habits show a checkbox; the rest open Hoy. */
        public final boolean showCheckbox;
        public final boolean checked;

        public Row(String id, String name, boolean showCheckbox, boolean checked) {
            this.id = id;
            this.name = name;
            this.showCheckbox = showCheckbox;
            this.checked = checked;
        }
    }

    public final Kind kind;
    public final int done;
    public final int total;
    public final List<Row> rows;
    /** "+N más" */
    public final int moreCount;
    /** Showing cached data while offline. */
    public final boolean stale;
    /** Brief Spanish error to show, or null. */
    public final String error;

    public RenderModel(Kind kind, int done, int total, List<Row> rows, int moreCount, boolean stale, String error) {
        this.kind = kind;
        this.done = done;
        this.total = total;
        this.rows = Collections.unmodifiableList(new ArrayList<>(rows));
        this.moreCount = moreCount;
        this.stale = stale;
        this.error = error;
    }

    static RenderModel of(Kind kind) {
        return new RenderModel(kind, 0, 0, Collections.<Row>emptyList(), 0, false, null);
    }
}
