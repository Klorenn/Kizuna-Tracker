package com.kizunatracker.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Widget bearer token, encrypted with an AES-GCM key that lives in the Android Keystore (never exportable).
 * SharedPreferences only ever holds base64(iv):base64(ciphertext). Any decrypt failure (key invalidated,
 * backup restored on another device) wipes the token: the widget simply asks to be paired again.
 *
 * The alias is part of the upgrade contract (R-W17): changing it would orphan every paired widget.
 */
final class TokenStore {
    static final String KEY_ALIAS = "kizuna_widget_token_v1";
    private static final String PREFS = "kizuna_widget";
    private static final String PREF_TOKEN = "token";
    private static final String TRANSFORM = "AES/GCM/NoPadding";

    private final SharedPreferences prefs;

    TokenStore(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean hasToken() {
        return prefs.contains(PREF_TOKEN);
    }

    /** The plaintext token, or null when unpaired or undecryptable (which also clears it). */
    String get() {
        String stored = prefs.getString(PREF_TOKEN, null);
        if (stored == null) return null;
        try {
            int sep = stored.indexOf(':');
            if (sep <= 0) throw new IllegalStateException("bad token format");
            byte[] iv = Base64.decode(stored.substring(0, sep), Base64.NO_WRAP);
            byte[] ct = Base64.decode(stored.substring(sep + 1), Base64.NO_WRAP);
            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            clear();
            return null;
        }
    }

    boolean save(String token) {
        try {
            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.ENCRYPT_MODE, key(true));
            byte[] ct = c.doFinal(token.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            return prefs.edit().putString(PREF_TOKEN, packed).commit();
        } catch (Exception e) {
            clear();
            return false;
        }
    }

    void clear() {
        prefs.edit().remove(PREF_TOKEN).apply();
    }

    /** Clears only if the stored token is still {@code used}; a stale 401 must not wipe a newly paired token. */
    boolean clearIf(String used) {
        if (!TokenGuard.shouldClear(get(), used)) return false;
        clear();
        return true;
    }

    private static SecretKey key(boolean createIfMissing) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return (SecretKey) ks.getKey(KEY_ALIAS, null);
        }
        if (!createIfMissing) throw new IllegalStateException("key missing");
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return kg.generateKey();
    }
}
