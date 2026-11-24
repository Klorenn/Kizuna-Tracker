package com.kizunatracker.widget;

import java.util.Locale;
import java.util.regex.Pattern;

/** Mirrors SQL groups_normalize_code: 8 chars of [2-9A-HJ-NP-Z] (no 0, 1, I, O), one optional hyphen, any case. */
public final class PairingCode {
    private static final Pattern SHAPE = Pattern.compile("^[2-9A-HJ-NP-Za-hj-np-z]{8}$");

    private PairingCode() {}

    /** Canonical ABCD2345, or null when the input cannot be a code. */
    public static String normalize(String input) {
        if (input == null || input.length() > 64) return null;
        String v = input.replaceAll("\\s", "");
        int hyphens = v.length() - v.replace("-", "").length();
        if (hyphens > 1) return null;
        v = v.replace("-", "");
        if (!SHAPE.matcher(v).matches()) return null;
        return v.toUpperCase(Locale.ROOT);
    }

    /** ABCD-2345 for display, or null when invalid. */
    public static String format(String input) {
        String n = normalize(input);
        return n == null ? null : n.substring(0, 4) + "-" + n.substring(4);
    }
}
