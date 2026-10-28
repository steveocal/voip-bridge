package info.systecgroup.voipbridge;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.ContactsContract;

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
 * The phone's own address book, for the dashboard's Contacts → Phone tab.
 * list() asks for READ_CONTACTS the first time, then returns every contact
 * with at least one number: [{id, name, numbers: [..]}], sorted by name.
 */
@CapacitorPlugin(
        name = "DeviceContacts",
        permissions = {
                @Permission(alias = "contacts", strings = {Manifest.permission.READ_CONTACTS}),
        }
)
public class DeviceContactsPlugin extends Plugin {

    @PluginMethod
    public void list(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "onContacts");
            return;
        }
        read(call);
    }

    @PermissionCallback
    private void onContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("Contacts permission not granted", "DENIED");
            return;
        }
        read(call);
    }

    private void read(PluginCall call) {
        ContentResolver cr = getContext().getContentResolver();
        String[] cols = {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        Map<Long, JSObject> byId = new LinkedHashMap<>();
        try (Cursor c = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, cols, null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    long id = c.getLong(0);
                    String number = c.getString(2);
                    if (number == null || number.trim().isEmpty()) continue;
                    JSObject o = byId.get(id);
                    if (o == null) {
                        o = new JSObject();
                        o.put("id", String.valueOf(id));
                        o.put("name", c.getString(1) == null ? "" : c.getString(1));
                        o.put("numbers", new JSArray());
                        byId.put(id, o);
                    }
                    JSArray nums = (JSArray) o.getJSONArray("numbers");
                    String n = number.trim();
                    boolean dup = false;
                    for (int i = 0; i < nums.length(); i++) {
                        if (n.replaceAll("[^+0-9]", "").equals(nums.optString(i).replaceAll("[^+0-9]", ""))) { dup = true; break; }
                    }
                    if (!dup) nums.put(n);
                }
            }
        } catch (Exception e) {
            call.reject("Couldn't read contacts: " + e.getMessage());
            return;
        }
        JSArray out = new JSArray();
        for (JSObject o : byId.values()) out.put(o);
        JSObject r = new JSObject();
        r.put("contacts", out);
        call.resolve(r);
    }
}
