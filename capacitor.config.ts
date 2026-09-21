import type { CapacitorConfig } from "@capacitor/cli";

// The app is a thin native shell around the hosted dashboard (served by the
// Cloudflare Worker), so UI changes deploy with `wrangler deploy` and never
// need a new APK. webDir is only the offline fallback Capacitor requires.
const config: CapacitorConfig = {
  appId: "info.systecgroup.voipbridge",
  appName: "VoIP Bridge",
  webDir: "public",
  server: {
    url: "https://voip-bridge.wandering-mode-c597.workers.dev/dashboard",
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: { presentationOptions: ["alert", "sound"] },
  },
};

export default config;
