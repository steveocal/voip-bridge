package info.systecgroup.voipbridge;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Runs every 15 minutes (WorkManager's shortest period) while an employee is
 * signed in: takes one GPS reading and posts it to the worker's
 * /staff/location. Readings that can't be sent (no signal) are queued and
 * sent, oldest first, on the next run.
 */
public class LocationWorker extends Worker {
    static final String PREFS = "staff_location";
    static final String KEY_TOKEN = "token";
    static final String KEY_NAME = "name";
    static final String KEY_URL = "url";
    static final String KEY_QUEUE = "queue";
    static final String KEY_LAST_FIX = "last_fix_at";
    static final String KEY_LAST_SENT = "last_sent_at";
    static final String KEY_LAST_ERROR = "last_error";
    private static final int MAX_QUEUE = 200;

    public LocationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(KEY_TOKEN, null);
        String url = prefs.getString(KEY_URL, null);
        if (token == null || url == null) return Result.success();

        JSONArray queue = readQueue(prefs);
        try {
            Location loc = currentLocation(ctx);
            if (loc != null) {
                JSONObject fix = new JSONObject();
                fix.put("lat", loc.getLatitude());
                fix.put("lon", loc.getLongitude());
                fix.put("accuracy", Math.round(loc.getAccuracy()));
                fix.put("at", System.currentTimeMillis());
                queue.put(fix);
                prefs.edit().putLong(KEY_LAST_FIX, System.currentTimeMillis()).apply();
            }
        } catch (Exception e) {
            prefs.edit().putString(KEY_LAST_ERROR, "location: " + e.getMessage()).apply();
        }

        // Send oldest first; stop at the first failure and keep the rest.
        JSONArray left = new JSONArray();
        boolean failed = false;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject fix = queue.optJSONObject(i);
            if (fix == null) continue;
            if (failed) { left.put(fix); continue; }
            try {
                fix.put("token", token);
                int status = post(url + "/staff/location", fix);
                fix.remove("token");
                if (status == 401) {
                    // Signed out on the server side (secret changed): stop tracking.
                    StaffLocationPlugin.stop(ctx);
                    prefs.edit().putString(KEY_LAST_ERROR, "signed out by server").apply();
                    return Result.success();
                }
                if (status >= 500 || status < 0) { failed = true; left.put(fix); continue; }
                prefs.edit().putLong(KEY_LAST_SENT, System.currentTimeMillis()).remove(KEY_LAST_ERROR).apply();
            } catch (Exception e) {
                fix.remove("token");
                failed = true;
                left.put(fix);
                prefs.edit().putString(KEY_LAST_ERROR, "send: " + e.getMessage()).apply();
            }
        }
        // Drop the oldest if we've been offline for days.
        while (left.length() > MAX_QUEUE) left.remove(0);
        prefs.edit().putString(KEY_QUEUE, left.toString()).apply();
        return Result.success();
    }

    private static Location currentLocation(Context ctx) throws Exception {
        boolean fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) throw new SecurityException("location permission not granted");
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(ctx);
        // GPS accuracy: stops are told apart at 20 m, which wifi/cell can't do.
        CurrentLocationRequest req = new CurrentLocationRequest.Builder()
                .setPriority(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setDurationMillis(60_000)
                .setMaxUpdateAgeMillis(60_000)
                .build();
        Location loc = Tasks.await(client.getCurrentLocation(req, null), 70, TimeUnit.SECONDS);
        if (loc == null) loc = Tasks.await(client.getLastLocation(), 10, TimeUnit.SECONDS);
        return loc;
    }

    private static int post(String url, JSONObject body) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(30_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            return conn.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static JSONArray readQueue(SharedPreferences prefs) {
        try { return new JSONArray(prefs.getString(KEY_QUEUE, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }
}
