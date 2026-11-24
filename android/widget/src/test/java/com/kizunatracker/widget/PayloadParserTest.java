package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

public class PayloadParserTest {
    private static final String OK = "{\"v\":1,\"date\":\"2026-11-24\",\"timeZone\":\"America/Santiago\","
            + "\"done\":3,\"total\":7,\"pending\":4,\"habits\":["
            + "{\"id\":\"a\",\"name\":\"Meditar\",\"kind\":\"toggle\"},"
            + "{\"id\":\"b\",\"name\":\"Leer\",\"kind\":\"open\"}]}";

    @Test public void parsesAValidPayload() throws Exception {
        WidgetPayload p = PayloadParser.parse(OK);
        assertEquals("2026-11-24", p.date);
        assertEquals("America/Santiago", p.timeZone);
        assertEquals(3, p.done);
        assertEquals(7, p.total);
        assertEquals(4, p.pending);
        assertEquals(2, p.habits.size());
        assertEquals("a", p.habits.get(0).id);
        assertEquals("Meditar", p.habits.get(0).name);
        assertTrue(p.habits.get(0).isToggle());
        assertFalse(p.habits.get(1).isToggle());
    }

    @Test public void unknownKindDegradesToOpen() throws Exception {
        WidgetPayload p = PayloadParser.parse(OK.replace("\"toggle\"", "\"swipe\""));
        assertFalse(p.habits.get(0).isToggle());
    }

    @Test public void rejectsOtherVersionsAsUnsupported() {
        for (String v : new String[] {"2", "0", "99"}) {
            try {
                PayloadParser.parse(OK.replace("\"v\":1", "\"v\":" + v));
                fail("expected rejection for v=" + v);
            } catch (PayloadParser.PayloadException e) {
                assertTrue(e.unsupportedVersion);
            }
        }
    }

    @Test public void rejectsMissingOrMistypedFields() {
        String[] bad = {
            "", "not json", "[]", "{}",
            OK.replace("\"v\":1,", ""),
            OK.replace("\"date\":\"2026-11-24\",", ""),
            OK.replace("\"timeZone\":\"America/Santiago\",", ""),
            OK.replace("\"done\":3,", ""),
            OK.replace("\"total\":7,", ""),
            OK.replace("\"pending\":4,", ""),
            OK.replace("\"habits\":[", "\"habitz\":["),
            OK.replace("\"done\":3", "\"done\":\"3\""),
            OK.replace("\"id\":\"a\",", ""),
            OK.replace("\"name\":\"Meditar\",", ""),
            OK.replace("\"date\":\"2026-11-24\"", "\"date\":\"24/11/2026\""),
        };
        for (String s : bad) {
            try {
                PayloadParser.parse(s);
                fail("expected rejection for: " + s);
            } catch (PayloadParser.PayloadException e) {
                assertFalse("not a version error: " + s, e.unsupportedVersion);
            }
        }
    }

    @Test public void nullInputIsRejected() {
        try {
            PayloadParser.parse(null);
            fail();
        } catch (PayloadParser.PayloadException expected) {
            // ok
        }
    }

    @Test public void checkinResponseCarriesTheNewToday() throws Exception {
        WidgetPayload p = PayloadParser.parseCheckin("{\"created\":true,\"today\":" + OK + "}");
        assertEquals(4, p.pending);
    }

    @Test public void checkinResponseWithNullTodayYieldsNull() throws Exception {
        assertNull(PayloadParser.parseCheckin("{\"created\":false,\"today\":null}"));
        assertNull(PayloadParser.parseCheckin("{\"created\":false}"));
    }

    @Test public void tokenFromPairResponse() throws Exception {
        PayloadParser.PairResult r = PayloadParser.parsePair("{\"token\":\"kzw_abc\",\"username\":\"pau\"}");
        assertEquals("kzw_abc", r.token);
        assertEquals("pau", r.username);
    }

    @Test public void pairResponseWithoutTokenIsRejected() {
        try {
            PayloadParser.parsePair("{\"username\":\"pau\"}");
            fail();
        } catch (PayloadParser.PayloadException expected) {
            // ok
        }
    }
}
