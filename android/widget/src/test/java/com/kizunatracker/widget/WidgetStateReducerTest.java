package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class WidgetStateReducerTest {
    private static final String TODAY = "2026-11-24";

    private static WidgetPayload payload(String date, int done, int total, WidgetPayload.Habit... habits) {
        List<WidgetPayload.Habit> list = new ArrayList<>();
        for (WidgetPayload.Habit h : habits) list.add(h);
        return new WidgetPayload(date, "UTC", done, total, total - done, list);
    }

    private static WidgetPayload.Habit toggle(String id) { return new WidgetPayload.Habit(id, "H" + id, WidgetPayload.Habit.TOGGLE); }
    private static WidgetPayload.Habit open(String id) { return new WidgetPayload.Habit(id, "H" + id, WidgetPayload.Habit.OPEN); }

    private static WidgetPayload pendingN(int n, int done) {
        WidgetPayload.Habit[] hs = new WidgetPayload.Habit[Math.min(n, 8)];
        for (int i = 0; i < hs.length; i++) hs[i] = toggle("t" + i);
        return payload(TODAY, done, done + n, hs);
    }

    private static WidgetStateReducer.State loaded(WidgetPayload p) {
        return WidgetStateReducer.reduce(WidgetStateReducer.State.connected(), WidgetStateReducer.Event.loaded(p));
    }

    @Test public void noTokenIsUnconnected() {
        RenderModel m = WidgetStateReducer.render(WidgetStateReducer.State.unconnected(), 4, TODAY);
        assertEquals(RenderModel.Kind.UNCONNECTED, m.kind);
    }

    @Test public void connectedWithoutPayloadIsLoading() {
        RenderModel m = WidgetStateReducer.render(WidgetStateReducer.State.connected(), 4, TODAY);
        assertEquals(RenderModel.Kind.LOADING, m.kind);
    }

    @Test public void listShowsHeaderAndUncheckedRows() {
        RenderModel m = WidgetStateReducer.render(loaded(payload(TODAY, 2, 5, toggle("a"), toggle("b"), toggle("c"))), 4, TODAY);
        assertEquals(RenderModel.Kind.LIST, m.kind);
        assertEquals(2, m.done);
        assertEquals(5, m.total);
        assertEquals(3, m.rows.size());
        for (RenderModel.Row r : m.rows) {
            assertTrue(r.showCheckbox);
            assertFalse(r.checked);
        }
        assertEquals(0, m.moreCount);
        assertFalse(m.stale);
        assertNull(m.error);
    }

    @Test public void overflowShowsFourRowsAndPlusN() {
        RenderModel m = WidgetStateReducer.render(loaded(pendingN(7, 0)), 4, TODAY);
        assertEquals(4, m.rows.size());
        assertEquals(3, m.moreCount);
    }

    @Test public void compactLayoutShowsTwoRows() {
        RenderModel m = WidgetStateReducer.render(loaded(pendingN(7, 0)), 2, TODAY);
        assertEquals(2, m.rows.size());
        assertEquals(5, m.moreCount);
    }

    @Test public void moreCountUsesServerPendingWhenPayloadIsCapped() {
        // 12 pending, only 8 travel in the payload.
        WidgetPayload p = new WidgetPayload(TODAY, "UTC", 0, 12, 12, pendingN(8, 0).habits);
        RenderModel m = WidgetStateReducer.render(loaded(p), 4, TODAY);
        assertEquals(8, m.moreCount);
    }

    @Test public void allDoneWhenNothingPendingAndTotalPositive() {
        RenderModel m = WidgetStateReducer.render(loaded(payload(TODAY, 5, 5)), 4, TODAY);
        assertEquals(RenderModel.Kind.ALL_DONE, m.kind);
        assertEquals(5, m.done);
        assertEquals(5, m.total);
    }

    @Test public void noHabitsAtAllIsEmptyNotAllDone() {
        RenderModel m = WidgetStateReducer.render(loaded(payload(TODAY, 0, 0)), 4, TODAY);
        assertEquals(RenderModel.Kind.EMPTY, m.kind);
    }

    @Test public void openRowsHaveNoCheckbox() {
        RenderModel m = WidgetStateReducer.render(loaded(payload(TODAY, 0, 2, toggle("a"), open("b"))), 4, TODAY);
        assertTrue(m.rows.get(0).showCheckbox);
        assertFalse(m.rows.get(1).showCheckbox);
    }

    @Test public void optimisticToggleChecksTheRowAndIncrementsHeader() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 2, 5, toggle("a"), toggle("b"), toggle("c")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("b"));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(3, m.done);
        assertTrue(m.rows.get(1).checked);
        assertFalse(m.rows.get(0).checked);
        assertEquals(3, m.rows.size()); // the ticked row stays until the next load
    }

    @Test public void tickingTheLastPendingShowsAllDone() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 4, 5, toggle("z")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("z"));
        assertEquals(RenderModel.Kind.ALL_DONE, WidgetStateReducer.render(s, 4, TODAY).kind);
    }

    @Test public void toggleRequestedIgnoresOpenAndUnknownRows() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 0, 2, toggle("a"), open("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("b"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("nope"));
        assertEquals(0, WidgetStateReducer.render(s, 4, TODAY).done);
    }

    @Test public void doubleTapDoesNotDoubleCount() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 0, 2, toggle("a"), toggle("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        assertEquals(1, WidgetStateReducer.render(s, 4, TODAY).done);
    }

    @Test public void toggleFailureRevertsAndShowsTheError() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 2, 5, toggle("a"), toggle("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleFailed("a", "No se pudo marcar"));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(2, m.done);
        assertFalse(m.rows.get(0).checked);
        assertEquals("No se pudo marcar", m.error);
    }

    @Test public void toggleOkWithServerPayloadReplacesIt() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 2, 5, toggle("a"), toggle("b"), toggle("c")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleOk("a", payload(TODAY, 3, 5, toggle("b"), toggle("c"))));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(3, m.done);
        assertEquals(2, m.rows.size());
        assertFalse(m.rows.get(0).checked);
    }

    @Test public void toggleOkWithoutPayloadKeepsTheTickLocally() {
        // The server's re-read can fail after a successful check-in: it answers today:null.
        WidgetStateReducer.State s = loaded(payload(TODAY, 2, 5, toggle("a"), toggle("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleOk("a", null));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(3, m.done);
        assertEquals(1, m.rows.size());
        assertEquals("b", m.rows.get(0).id);
    }

    @Test public void unauthorizedGoesBackToUnconnectedAndDropsCache() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 0, 1, toggle("a")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.unauthorized());
        assertEquals(RenderModel.Kind.UNCONNECTED, WidgetStateReducer.render(s, 4, TODAY).kind);
        assertNull(s.payload);
    }

    @Test public void offlineKeepsTheCachedListAndMarksItStale() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 1, 3, toggle("a"), toggle("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.offline());
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(RenderModel.Kind.LIST, m.kind);
        assertTrue(m.stale);
        assertEquals(2, m.rows.size());
    }

    @Test public void offlineWithoutCacheIsAMessage() {
        WidgetStateReducer.State s = WidgetStateReducer.reduce(WidgetStateReducer.State.connected(), WidgetStateReducer.Event.offline());
        assertEquals(RenderModel.Kind.OFFLINE_EMPTY, WidgetStateReducer.render(s, 4, TODAY).kind);
    }

    @Test public void reconnectClearsStaleAndError() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 1, 3, toggle("a")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.offline());
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleFailed("a", "x"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.loaded(payload(TODAY, 1, 3, toggle("a"))));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertFalse(m.stale);
        assertNull(m.error);
    }

    @Test public void yesterdaysPayloadIsNeverShownAsCurrent() {
        WidgetStateReducer.State s = loaded(payload("2026-11-23", 1, 3, toggle("a")));
        RenderModel m = WidgetStateReducer.render(s, 4, TODAY);
        assertEquals(RenderModel.Kind.LOADING, m.kind);
        assertTrue(m.rows.isEmpty());
    }

    @Test public void yesterdaysPayloadOfflineIsAMessageNotAList() {
        WidgetStateReducer.State s = loaded(payload("2026-11-23", 1, 3, toggle("a")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.offline());
        assertEquals(RenderModel.Kind.OFFLINE_EMPTY, WidgetStateReducer.render(s, 4, TODAY).kind);
    }

    @Test public void rolloverEventDropsOptimisticTicksAndError() {
        WidgetStateReducer.State s = loaded(payload(TODAY, 0, 2, toggle("a"), toggle("b")));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.toggleRequested("a"));
        s = WidgetStateReducer.reduce(s, WidgetStateReducer.Event.rollover());
        assertEquals(0, WidgetStateReducer.render(s, 4, TODAY).done);
    }

    @Test public void reducerNeverMutatesTheInputState() {
        WidgetStateReducer.State before = loaded(payload(TODAY, 0, 1, toggle("a")));
        WidgetStateReducer.reduce(before, WidgetStateReducer.Event.toggleRequested("a"));
        assertEquals(0, WidgetStateReducer.render(before, 4, TODAY).done);
    }
}
