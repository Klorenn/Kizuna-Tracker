package com.kizunatracker.widget;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Invisible trampoline for taps on the widget: refresh the widget, then open the app on Hoy (kizuna:// for the native app, https for the TWA). A real activity
 * (not a broadcast trampoline) because Android 12+ restricts starting activities from the background.
 */
public class WidgetOpenActivity extends Activity {
    static final String EXTRA_PATH = "path";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sendBroadcast(new Intent(this, KizunaWidgetProvider.class).setAction(KizunaWidgetProvider.ACTION_REFRESH));

        String path = getIntent().getStringExtra(EXTRA_PATH);
        if (path == null || !path.startsWith("/")) path = "/";
        // The native app first (kizuna://), then the https URL for the TWA, which does not register the scheme.
        // setPackage keeps both to our own app: never a chooser or another browser.
        Intent nativeView = new Intent(Intent.ACTION_VIEW, Uri.parse("kizuna://" + path.substring(1)))
                .setPackage(getPackageName())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(nativeView);
        } catch (ActivityNotFoundException notNative) {
            Intent webView = new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.kz_widget_base_url) + path))
                    .setPackage(getPackageName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(webView);
            } catch (RuntimeException ignored) {
                // nothing sensible to show from an invisible activity
            }
        } catch (RuntimeException ignored) {
            // nothing sensible to show from an invisible activity
        }
        finish();
    }
}
