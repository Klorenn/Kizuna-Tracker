package com.kizunatracker.widget;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Invisible trampoline for taps on the widget: refresh the widget, then open the app on Hoy. A real activity
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
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.kz_widget_base_url) + path))
                .setPackage(getPackageName()) // never a chooser or another browser: our TWA's LauncherActivity
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(view);
        } catch (RuntimeException ignored) {
            // nothing sensible to show from an invisible activity
        }
        finish();
    }
}
