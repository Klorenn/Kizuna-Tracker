package com.kizunatracker.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class PairingCodeTest {
    @Test public void normalizesCaseHyphenAndSpaces() {
        assertEquals("ABCD2345", PairingCode.normalize("abcd-2345"));
        assertEquals("ABCD2345", PairingCode.normalize("  ab cd - 23 45 \n"));
        assertEquals("ABCD2345", PairingCode.normalize("ABCD2345"));
    }

    @Test public void rejectsAmbiguousCharacters() {
        assertNull(PairingCode.normalize("ABCD-0234")); // 0
        assertNull(PairingCode.normalize("ABCD-1234")); // 1
        assertNull(PairingCode.normalize("ABCD-I234")); // I
        assertNull(PairingCode.normalize("ABCD-O234")); // O
        assertNull(PairingCode.normalize("abcd-o234")); // lowercase o
    }

    @Test public void rejectsWrongLengthNullAndSymbols() {
        assertNull(PairingCode.normalize(null));
        assertNull(PairingCode.normalize(""));
        assertNull(PairingCode.normalize("ABCD-234"));
        assertNull(PairingCode.normalize("ABCD-23456"));
        assertNull(PairingCode.normalize("ABCD-23$5"));
        assertNull(PairingCode.normalize("ABCD--2345"));
        assertNull(PairingCode.normalize("AB-CD-2345"));
    }

    @Test public void formatsAsTwoGroups() {
        assertEquals("ABCD-2345", PairingCode.format("ABCD2345"));
        assertEquals("ABCD-2345", PairingCode.format("abcd-2345"));
    }

    @Test public void formatOfInvalidReturnsNull() {
        assertNull(PairingCode.format("nope"));
    }
}
