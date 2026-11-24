package com.kizunatracker.widget;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.IOException;

/**
 * Pairs this phone with the user's account: code in, token out.
 *
 * Exported for the kizuna://widget/pair deep link, so it must never act on the link alone: the code is only
 * PREFILLED and nothing is exchanged until the person taps "Conectar" (otherwise a crafted link could pair
 * this phone to an attacker's account).
 */
public class WidgetSetupActivity extends Activity {
    private static final String ABOUT_PATH = "/perfil/ajustes#widget";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private EditText codeField;
    private Button connect;
    private Button openApp;
    private TextView status;
    private boolean busy;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data != null) {
            String formatted = PairingCode.format(data.getQueryParameter("code"));
            if (formatted != null) codeField.setText(formatted); // prefill only
        }
    }

    private void buildUi() {
        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText(R.string.kz_widget_setup_title);
        title.setTextSize(20);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText(R.string.kz_widget_setup_hint);
        hint.setPadding(0, dp(8), 0, dp(8));
        root.addView(hint);

        codeField = new EditText(this);
        codeField.setHint(R.string.kz_widget_code_hint);
        codeField.setSingleLine(true);
        codeField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        codeField.setGravity(Gravity.CENTER);
        codeField.setTextSize(22);
        root.addView(codeField, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        connect = new Button(this);
        connect.setText(R.string.kz_widget_connect);
        connect.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onConnect(); }
        });
        root.addView(connect);

        status = new TextView(this);
        status.setPadding(0, dp(8), 0, dp(8));
        root.addView(status);

        openApp = new Button(this);
        openApp.setText(R.string.kz_widget_open_app);
        openApp.setVisibility(View.GONE);
        openApp.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.kz_widget_base_url) + ABOUT_PATH))
                        .setPackage(getPackageName()));
                finish();
            }
        });
        root.addView(openApp);

        setContentView(root);
    }

    private void onConnect() {
        if (busy) return;
        final String code = PairingCode.normalize(codeField.getText().toString());
        if (code == null) {
            status.setText(R.string.kz_widget_err_code_shape);
            return;
        }
        busy = true;
        connect.setEnabled(false);
        status.setText(R.string.kz_widget_connecting);
        final Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                final String message = pair(app, code);
                ui.post(new Runnable() {
                    @Override public void run() { onResult(message); }
                });
            }
        }, "kz-widget-pair").start();
    }

    /** Returns the text to show; success is signalled by a message starting with the connected prefix. */
    private String pair(Context app, String code) {
        TokenStore tokens = new TokenStore(app);
        try {
            String previous = tokens.get(); // re-pairing revokes the old token server-side without eating a cap slot
            WidgetApi.Result r = new WidgetApi(app).pair(code, deviceLabel(), previous);
            if (r.ok()) {
                PayloadParser.PairResult p = PayloadParser.parsePair(r.body);
                if (!tokens.save(p.token)) return getString(R.string.kz_widget_err_store);
                new PayloadCache(app).clear();
                app.sendBroadcast(new Intent(app, KizunaWidgetProvider.class).setAction(KizunaWidgetProvider.ACTION_REFRESH));
                return CONNECTED_PREFIX + getString(R.string.kz_widget_connected_as, p.username);
            }
            if (r.status == 409) return getString(R.string.kz_widget_err_cap);
            if (r.status == 429) return getString(R.string.kz_widget_err_rate);
            if (r.status == 400 && "invalid_code".equals(r.errorCode())) return getString(R.string.kz_widget_err_code_invalid);
            return getString(R.string.kz_widget_err_connect);
        } catch (IOException e) {
            return getString(R.string.kz_widget_err_connect);
        } catch (PayloadParser.PayloadException e) {
            return getString(R.string.kz_widget_err_connect);
        }
    }

    private static final String CONNECTED_PREFIX = "\u0001";

    private void onResult(String message) {
        if (isFinishing() || isDestroyed()) return;
        busy = false;
        if (message.startsWith(CONNECTED_PREFIX)) {
            status.setText(message.substring(CONNECTED_PREFIX.length()));
            connect.setVisibility(View.GONE);
            codeField.setEnabled(false);
            openApp.setVisibility(View.VISIBLE);
        } else {
            status.setText(message);
            connect.setEnabled(true);
        }
    }

    private static String deviceLabel() {
        String label = (Build.MANUFACTURER + " " + Build.MODEL).trim();
        if (label.isEmpty()) label = "Android";
        return label.length() > 40 ? label.substring(0, 40) : label;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
