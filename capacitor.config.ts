import type { CapacitorConfig } from "@capacitor/cli";

// The app is a thin native shell around the hosted dashboard (served by the
// Cloudflare Worker), so UI changes deploy with `wrangler deploy` and never
// need a new APK. webDir is only the offline fallback Capacitor requires; it
// isn't public/ because that holds the hosted APK (public/app), which would
// otherwise get packaged into the next APK.
const config: CapacitorConfig = {
  appId: "info.systecgroup.voipbridge",
  appName: "VoIP Bridge",
  webDir: "app-shell",
  server: {
    url: "https://voip.ihpltd.co.uk/dashboard",
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: { presentationOptions: ["alert", "sound"] },
  },
};

export default config;
