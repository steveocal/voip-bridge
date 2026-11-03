package info.systecgroup.voipbridge;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CallLog;
import android.os.Bundle;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

/**
 * Calls over the phone's own SIM, for the dashboard's SIM / VoIP routing.
 * sims() lists the SIM cards that can call ([{id, label}], READ_PHONE_STATE).
 * call({number, sim}) places the call through Android's telecom service
 * (CALL_PHONE) on that SIM, or the phone's default when sim is empty.
 * Without CALL_PHONE it opens the dialer with the number filled in.
 * The phone's own dialer has the call from then on.
 * outgoing({since}) reads the phone's call log (READ_CALL_LOG): outgoing
 * calls that started at or after `since` (ms), [{number, date, duration}],
 * oldest first. The dashboard matches those to the SIM calls it placed
 * itself, and only those, for their durations.
 */
@CapacitorPlugin(
        name = "SimCall",
        permissions = {
                @Permission(alias = "call", strings = {Manifest.permission.CALL_PHONE}),
                @Permission(alias = "phoneState", strings = {Manifest.permission.READ_PHONE_STATE}),
                @Permission(alias = "callLog", strings = {Manifest.permission.READ_CALL_LOG}),
        }
)
public class SimCallPlugin extends Plugin {

    private TelecomManager telecom() {
        return (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);
    }

    /** SIM subscriptions that can place calls; empty without READ_PHONE_STATE. */
    private List<PhoneAccountHandle> simHandles() {
        List<PhoneAccountHandle> out = new ArrayList<>();
        if (getPermissionState("phoneState") != PermissionState.GRANTED) return out;
        try {
            TelecomManager tm = telecom();
            for (PhoneAccountHandle h : tm.getCallCapablePhoneAccounts()) {
                PhoneAccount pa = tm.getPhoneAccount(h);
                if (pa != null && pa.hasCapabilities(PhoneAccount.CAPABILITY_SIM_SUBSCRIPTION)) out.add(h);
            }
        } catch (SecurityException e) {
            // Permission revoked meanwhile: no list, the default SIM still works.
        }
        return out;
    }

    @PluginMethod
    public void sims(PluginCall call) {
        if (getPermissionState("phoneState") != PermissionState.GRANTED) {
            requestPermissionForAlias("phoneState", call, "onPhoneState");
            return;
        }
        listSims(call);
    }

    @PermissionCallback
    private void onPhoneState(PluginCall call) {
        listSims(call);
    }

    private void listSims(PluginCall call) {
        JSArray list = new JSArray();
        TelecomManager tm = telecom();
        int n = 0;
        for (PhoneAccountHandle h : simHandles()) {
            n++;
            PhoneAccount pa = tm.getPhoneAccount(h);
            CharSequence label = pa == null ? null : pa.getLabel();
            JSObject o = new JSObject();
            o.put("id", h.getId());
            o.put("label", label == null || label.length() == 0 ? "SIM " + n : label.toString());
            list.put(o);
        }
        JSObject r = new JSObject();
        r.put("sims", list);
        r.put("permission", getPermissionState("phoneState") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void outgoing(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("callLog", call, "onCallLog");
            return;
        }
        readOutgoing(call);
    }

    @PermissionCallback
    private void onCallLog(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            call.reject("Call log permission not granted", "DENIED");
            return;
        }
        readOutgoing(call);
    }

    private void readOutgoing(PluginCall call) {
        long since = call.getLong("since", 0L);
        String[] cols = {CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION};
        String where = CallLog.Calls.TYPE + " = ? AND " + CallLog.Calls.DATE + " >= ?";
        String[] args = {String.valueOf(CallLog.Calls.OUTGOING_TYPE), String.valueOf(since)};
        JSArray list = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(CallLog.Calls.CONTENT_URI, cols, where, args,
                CallLog.Calls.DATE + " ASC")) {
            if (c != null) {
                while (c.moveToNext() && list.length() < 200) {
                    JSObject o = new JSObject();
                    o.put("number", c.getString(0) == null ? "" : c.getString(0));
                    o.put("date", c.getLong(1));
                    o.put("duration", c.getLong(2));
                    list.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("Call log permission not granted", "DENIED");
            return;
        }
        JSObject r = new JSObject();
        r.put("calls", list);
        call.resolve(r);
    }

    @PluginMethod
    public void call(PluginCall call) {
        if (call.getString("number", "").trim().isEmpty()) {
            call.reject("number required");
            return;
        }
        if (getPermissionState("call") != PermissionState.GRANTED) {
            requestPermissionForAlias("call", call, "onCallPermission");
            return;
        }
        place(call);
    }

    @PermissionCallback
    private void onCallPermission(PluginCall call) {
        place(call);
    }

    private void place(PluginCall call) {
        String number = call.getString("number", "").trim();
        String simId = call.getString("sim", "");
        Uri uri = Uri.fromParts("tel", number, null);
        JSObject r = new JSObject();
        if (getPermissionState("call") == PermissionState.GRANTED) {
            Bundle extras = new Bundle();
            if (simId != null && !simId.isEmpty()) {
                for (PhoneAccountHandle h : simHandles()) {
                    if (simId.equals(h.getId())) {
                        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, h);
                        break;
                    }
                }
            }
            try {
                telecom().placeCall(uri, extras);
                r.put("method", "call");
                call.resolve(r);
                return;
            } catch (SecurityException e) {
                // Fall through to the dialer.
            }
        }
        // Declined (or refused by the system): the dialer still gets the
        // call made, one tap later.
        Intent intent = new Intent(Intent.ACTION_DIAL, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            call.reject("This phone can't place calls");
            return;
        }
        r.put("method", "dialer");
        call.resolve(r);
    }
}
