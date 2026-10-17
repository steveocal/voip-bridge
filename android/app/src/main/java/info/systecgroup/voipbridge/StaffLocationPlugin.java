package info.systecgroup.voipbridge;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.TimeUnit;

/**
 * Staff location tracking, driven from the dashboard's Settings:
 * signIn({token, name, url}) stores the employee's token and starts the
 * 15-minute LocationWorker; signOut() stops it. Location permission is asked
 * in two steps, as Android requires: while-in-use first, then "Allow all the
 * time" (background).
 */
@CapacitorPlugin(
        name = "StaffLocation",
        permissions = {
                @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "background", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
        }
)
public class StaffLocationPlugin extends Plugin {
    private static final String WORK_NAME = "staff_location";

    static void start(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(LocationWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    static void stop(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_NAME);
        ctx.getSharedPreferences(LocationWorker.PREFS, Context.MODE_PRIVATE).edit()
                .remove(LocationWorker.KEY_TOKEN).remove(LocationWorker.KEY_NAME).apply();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(LocationWorker.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String token = call.getString("token");
        String url = call.getString("url");
        if (token == null || url == null) { call.reject("token and url required"); return; }
        prefs().edit()
                .putString(LocationWorker.KEY_TOKEN, token)
                .putString(LocationWorker.KEY_NAME, call.getString("name", ""))
                .putString(LocationWorker.KEY_URL, url)
                .remove(LocationWorker.KEY_LAST_ERROR)
                .apply();
        start(getContext());
        status(call);
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        stop(getContext());
        status(call);
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject r = new JSObject();
        r.put("signedIn", p.getString(LocationWorker.KEY_TOKEN, null) != null);
        r.put("name", p.getString(LocationWorker.KEY_NAME, ""));
        r.put("lastFixAt", p.getLong(LocationWorker.KEY_LAST_FIX, 0));
        r.put("lastSentAt", p.getLong(LocationWorker.KEY_LAST_SENT, 0));
        r.put("lastError", p.getString(LocationWorker.KEY_LAST_ERROR, ""));
        r.put("location", getPermissionState("location").toString());
        r.put("background", Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ? "granted" : getPermissionState("background").toString());
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        r.put("batteryUnrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    /** Step 1: while-in-use location; step 2 (background) chains from it. */
    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onLocation");
        } else {
            onLocation(call);
        }
    }

    @PermissionCallback
    private void onLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || getPermissionState("background") == PermissionState.GRANTED) {
            status(call);
            return;
        }
        // Android 11+ shows no dialog for this; it sends the user to the
        // app's location setting to pick "Allow all the time".
        requestPermissionForAlias("background", call, "onBackground");
    }

    @PermissionCallback
    private void onBackground(PluginCall call) {
        status(call);
    }

    /** Asks to be exempt from battery optimisation (standard Android dialog). */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); }
        catch (Exception e) { openAppSettings(); }
        call.resolve();
    }

    /** Xiaomi's Autostart list (other phones: the app's settings page). */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Intent i = new Intent();
        i.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); }
        catch (Exception e) { openAppSettings(); }
        call.resolve();
    }

    private void openAppSettings() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }
}
