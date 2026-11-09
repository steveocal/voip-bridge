package info.systecgroup.voipbridge;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Rings the phone for an incoming VoIP call that reached the page. The
 * dashboard's own Web Audio tone plays on the media volume, is quiet, and
 * can be silent in a WebView, so the app uses the phone's real ringtone
 * instead. It plays on the ringer volume and follows silent and vibrate
 * mode, the same as a SIM call.
 * start() starts the ringtone and vibration (looped). stop() ends both.
 * The ring stops by itself after MAX_RING_MS in case stop() never arrives.
 * speaker({on}) (app 1.7) puts the call's audio on the loudspeaker or back on
 * the earpiece; the dashboard turns it off when the call ends.
 */
@CapacitorPlugin(name = "Ringer")
public class RingerPlugin extends Plugin {
    private static final long MAX_RING_MS = 90_000;
    private static final long[] PATTERN = {0, 800, 600, 800, 1800};

    private Ringtone ringtone;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable loop = this::loopRingtone;
    private final Runnable timeout = this::stopRinging;

    @PluginMethod
    public void start(PluginCall call) {
        main.post(() -> {
            startRinging();
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            stopRinging();
            call.resolve();
        });
    }

    @PluginMethod
    public void speaker(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        main.post(() -> {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) { call.reject("no audio manager"); return; }
            if (on) am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (on) {
                    AudioDeviceInfo spk = null;
                    for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                        if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) { spk = d; break; }
                    }
                    if (spk == null || !am.setCommunicationDevice(spk)) { call.reject("no loudspeaker"); return; }
                } else {
                    am.clearCommunicationDevice();
                }
            } else {
                am.setSpeakerphoneOn(on);
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        stopRinging();
    }

    private void startRinging() {
        stopRinging();
        Context ctx = getContext();
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        int mode = am != null ? am.getRingerMode() : AudioManager.RINGER_MODE_NORMAL;

        if (mode == AudioManager.RINGER_MODE_NORMAL) {
            Uri uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(ctx, uri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
                ringtone.play();
                // Before Android 9 there's no setLooping: restart it when it ends.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) main.postDelayed(loop, 1000);
            }
        }
        if (mode != AudioManager.RINGER_MODE_SILENT) {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(PATTERN, 0),
                        new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
                } else {
                    v.vibrate(PATTERN, 0);
                }
            }
        }
        main.postDelayed(timeout, MAX_RING_MS);
    }

    private void loopRingtone() {
        if (ringtone == null) return;
        if (!ringtone.isPlaying()) ringtone.play();
        main.postDelayed(loop, 1000);
    }

    private void stopRinging() {
        main.removeCallbacks(loop);
        main.removeCallbacks(timeout);
        if (ringtone != null) {
            try { ringtone.stop(); } catch (RuntimeException ignored) {}
            ringtone = null;
        }
        Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) v.cancel();
    }
}
