package info.systecgroup.voipbridge;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Handles the high-priority data push the worker sends when Asterisk has an
 * inbound call for this device. Works while the app is closed: it raises a
 * full-screen, ringing notification; tapping it (or the lock-screen takeover)
 * opens the dashboard, which registers with Asterisk and answers the call.
 *
 * Payload (all strings): type = "incoming_call" | "call_cancelled",
 * caller = "Name — number" (or the number), name = contact name from Odoo
 * (may be empty), number = the bare caller number.
 */
public class CallMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "incoming_calls";
    private static final int NOTIFICATION_ID = 4201;
    private static final long RING_TIMEOUT_MS = 45_000;

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if ("incoming_call".equals(type)) {
            showIncomingCall(callerText(data));
        } else if ("call_cancelled".equals(type)) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        }
    }

    /** "Name — number": Odoo's name from the worker, else the phone's own
     *  contact for the number, else just the number. */
    private String callerText(Map<String, String> data) {
        String number = data.get("number");
        if (number == null || number.isEmpty()) return data.get("caller"); // older worker
        String name = data.get("name");
        if (name == null || name.isEmpty()) name = phoneContactName(number);
        return name == null || name.isEmpty() ? number : name + " — " + number;
    }

    /** The phone's address-book name for a number, or null (no match, or no
     *  Contacts permission; this never asks for it). */
    private String phoneContactName(String number) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) return null;
        String digits = number.replaceAll("[^0-9]", "");
        // Asterisk drops the "+", so "447700900123" would miss a contact
        // saved as 07700 900123; put it back so PhoneLookup can match.
        String q = number.startsWith("+") || digits.length() <= 10 ? number : "+" + digits;
        Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(q));
        try (Cursor c = getContentResolver().query(uri,
                new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            // Unreadable contacts: just show the number.
        }
        return null;
    }

    private void showIncomingCall(String caller) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm);

        // Tapping the notification means "answer": MainActivity turns the
        // extra into the dashboard's auto-answer cookie.
        Intent tap = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("incoming_call_at", System.currentTimeMillis());
        PendingIntent tapPi = PendingIntent.getActivity(
            this, 0, tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // The full-screen intent only opens the app to its ringing screen. Android
        // fires it by itself when the phone is locked, so it must not carry the
        // answer extra, or every call to a locked phone answers itself.
        // (Separate request code: extras don't distinguish PendingIntents.)
        Intent show = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent showPi = PendingIntent.getActivity(
            this, 1, show, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle("Incoming call")
            .setContentText(caller == null || caller.isEmpty() ? "Unknown caller" : caller)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setContentIntent(tapPi)
            .setFullScreenIntent(showPi, true)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(RING_TIMEOUT_MS)
            .build();
        // Repeat the ring sound until answered/cancelled/timed out.
        n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(NOTIFICATION_ID, n);
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ch.setSound(ring, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        ch.enableVibration(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
