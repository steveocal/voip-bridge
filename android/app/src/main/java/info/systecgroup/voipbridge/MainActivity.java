package info.systecgroup.voipbridge;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Must match server.url in capacitor.config.ts (the cookie is per-origin).
    private static final String APP_ORIGIN = "https://voip.ihpltd.co.uk";
    // A tap older than this is a stale intent (e.g. re-delivered after process death).
    private static final long TAP_FRESH_MS = 60_000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(StaffLocationPlugin.class);
        registerPlugin(DeviceContactsPlugin.class);
        registerPlugin(SimCallPlugin.class);
        super.onCreate(savedInstanceState);
        markAnswerRequested(getIntent());
        // The WebView can't download files itself. Hand downloads (the app
        // update on /app/) to the browser, which saves the APK and offers to
        // install it.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) {
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        markAnswerRequested(intent);
    }

    /**
     * Tapping the incoming-call notification means "I want this call". The page
     * isn't loaded yet on a cold start, so leave a short-lived cookie for the
     * dashboard to find when the held call's INVITE arrives, and answer it.
     */
    private void markAnswerRequested(Intent intent) {
        if (intent == null) return;
        long at = intent.getLongExtra("incoming_call_at", 0);
        if (at == 0) return;
        intent.removeExtra("incoming_call_at");
        long now = System.currentTimeMillis();
        if (now - at > TAP_FRESH_MS) return;
        CookieManager.getInstance().setCookie(APP_ORIGIN, "vb_autoanswer=" + now + "; Max-Age=30; Path=/");
    }
}
