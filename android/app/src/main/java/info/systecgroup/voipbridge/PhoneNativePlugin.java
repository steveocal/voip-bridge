package info.systecgroup.voipbridge;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract.CommonDataKinds.Phone;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The phone's own telephony and address book, for the dashboard:
 * simCall({number}) rings out over the SIM (CALL_PHONE; without it, opens
 * the dialer with the number filled in), and contacts({query}) lists the
 * phone's own contacts (READ_CONTACTS) for the Contacts → Private tab.
 */
@CapacitorPlugin(
        name = "PhoneNative",
        permissions = {
                @Permission(alias = "call", strings = {Manifest.permission.CALL_PHONE}),
                @Permission(alias = "contacts", strings = {Manifest.permission.READ_CONTACTS}),
        }
)
public class PhoneNativePlugin extends Plugin {
    private static final int MAX_CONTACTS = 500;

    @PluginMethod
    public void simCall(PluginCall call) {
        String number = call.getString("number", "").trim();
        if (number.isEmpty()) { call.reject("number required"); return; }
        if (getPermissionState("call") != PermissionState.GRANTED) {
            requestPermissionForAlias("call", call, "callPermission");
            return;
        }
        startCall(call, number, Intent.ACTION_CALL);
    }

    @PermissionCallback
    private void callPermission(PluginCall call) {
        String number = call.getString("number", "").trim();
        // Declined: the dialer still gets the call made, one tap later.
        startCall(call, number, getPermissionState("call") == PermissionState.GRANTED ? Intent.ACTION_CALL : Intent.ACTION_DIAL);
    }

    private void startCall(PluginCall call, String number, String action) {
        Intent intent = new Intent(action, Uri.fromParts("tel", number, null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("This phone can't place the call: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("method", Intent.ACTION_CALL.equals(action) ? "call" : "dialer");
        call.resolve(r);
    }

    @PluginMethod
    public void contacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermission");
            return;
        }
        readContacts(call);
    }

    @PermissionCallback
    private void contactsPermission(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) readContacts(call);
        else call.reject("permission denied");
    }

    /** [{id, name, numbers: [{number, label}]}] by name, optionally filtered
     *  by a query on name or number. */
    private void readContacts(PluginCall call) {
        String query = call.getString("query", "").trim();
        String selection = null;
        String[] args = null;
        if (!query.isEmpty()) {
            selection = Phone.DISPLAY_NAME_PRIMARY + " LIKE ? OR " + Phone.NUMBER + " LIKE ?";
            args = new String[]{"%" + query + "%", "%" + query + "%"};
        }
        ContentResolver cr = getContext().getContentResolver();
        Map<Long, JSObject> byContact = new LinkedHashMap<>();
        Map<Long, JSArray> numbers = new LinkedHashMap<>();
        try (Cursor c = cr.query(Phone.CONTENT_URI,
                new String[]{Phone.CONTACT_ID, Phone.DISPLAY_NAME_PRIMARY, Phone.NUMBER, Phone.TYPE, Phone.LABEL},
                selection, args, Phone.DISPLAY_NAME_PRIMARY + " COLLATE NOCASE")) {
            while (c != null && c.moveToNext()) {
                long id = c.getLong(0);
                JSObject contact = byContact.get(id);
                if (contact == null) {
                    if (byContact.size() >= MAX_CONTACTS) break;
                    contact = new JSObject();
                    contact.put("id", id);
                    contact.put("name", c.getString(1));
                    byContact.put(id, contact);
                    numbers.put(id, new JSArray());
                }
                JSObject num = new JSObject();
                num.put("number", c.getString(2));
                num.put("label", Phone.getTypeLabel(getContext().getResources(), c.getInt(3), c.getString(4)).toString());
                numbers.get(id).put(num);
            }
        } catch (SecurityException e) {
            call.reject("permission denied");
            return;
        }
        JSArray list = new JSArray();
        for (Map.Entry<Long, JSObject> e : byContact.entrySet()) {
            e.getValue().put("numbers", numbers.get(e.getKey()));
            list.put(e.getValue());
        }
        JSObject r = new JSObject();
        r.put("contacts", list);
        call.resolve(r);
    }
}
