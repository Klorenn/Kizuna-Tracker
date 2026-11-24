package com.kizunatracker.widget;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/** Blocking HTTP client for /api/widget/*. Call from a background thread only. */
final class WidgetApi {
    private static final int CONNECT_TIMEOUT_MS = 4000;
    private static final int READ_TIMEOUT_MS = 5000;
    /** Pairing is the one call that must not be abandoned early: a lost response leaves an orphan token server-side. */
    static final int PAIR_READ_TIMEOUT_MS = 15000;
    private static final int MAX_BODY_BYTES = 64 * 1024;
    private static final String USER_AGENT = "KizunaWidget/1";

    static final class Result {
        final int status;
        final String body;

        Result(int status, String body) {
            this.status = status;
            this.body = body;
        }

        boolean ok() { return status >= 200 && status < 300; }

        /** The server's machine code ("invalid_code", "limit_reached", ...), or "". */
        String errorCode() {
            try {
                return new JSONObject(body).optString("error", "");
            } catch (JSONException e) {
                return "";
            }
        }
    }

    private final String baseUrl;

    WidgetApi(Context context) {
        this.baseUrl = context.getString(R.string.kz_widget_base_url);
    }

    Result today(String token) throws IOException {
        return call("GET", "/api/widget/today", token, null, READ_TIMEOUT_MS);
    }

    Result checkin(String token, String habitId) throws IOException {
        try {
            return call("POST", "/api/widget/checkin", token, new JSONObject().put("habitId", habitId).toString(), READ_TIMEOUT_MS);
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    Result pair(String code, String label, String previousToken) throws IOException {
        try {
            JSONObject body = new JSONObject().put("code", code).put("label", label);
            if (previousToken != null) body.put("previousToken", previousToken);
            return call("POST", "/api/widget/pair", null, body.toString(), PAIR_READ_TIMEOUT_MS);
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    private Result call(String method, String path, String token, String jsonBody, int readTimeoutMs) throws IOException {
        if (!baseUrl.startsWith("https://")) throw new IOException("refusing non-https base url");
        HttpURLConnection c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(CONNECT_TIMEOUT_MS);
            c.setReadTimeout(readTimeoutMs);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", USER_AGENT);
            c.setRequestProperty("Accept", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (jsonBody != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.getOutputStream().write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Result(status, in == null ? "" : read(in));
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_BODY_BYTES) throw new IOException("response too large");
            }
            return out.toString("UTF-8");
        } finally {
            in.close();
        }
    }
}
