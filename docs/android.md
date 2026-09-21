# Android app (Capacitor)

The app is a thin native shell around the hosted dashboard
(`capacitor.config.ts` → `server.url`), so UI changes ship with
`wrangler deploy` — no new APK. The native project adds what a web page can't:
mic permission, and waking the phone for an inbound call.

## Incoming-call flow

1. Inbound call hits Asterisk's `[voipms-inbound]` dialplan.
2. Dialplan calls the worker: `GET /push/wake?secret=…&extension=202&caller=…`.
3. Worker sends a high-priority FCM data message to every device token
   registered for that extension (`push_tokens` table).
4. `CallMessagingService` shows a full-screen ringing notification (works with
   the app closed, and over the lock screen).
5. The app opens, the dashboard registers extension 202 over WSS, and Asterisk
   — which has been holding the call — delivers the INVITE. The page rings and
   the native notification is cleared.

## One-time setup

### Firebase (needed for push)
1. Create a Firebase project; add an Android app with package
   `info.systecgroup.voipbridge`.
2. Download `google-services.json` → `android/app/google-services.json`
   (gitignore it or commit it — it holds no private key).
3. Project settings → Service accounts → generate a private key (JSON), then:
   `npx wrangler secret put FCM_SERVICE_ACCOUNT` (paste the whole JSON).
4. `npx wrangler secret put PUSH_SECRET` (any long random string; Asterisk uses
   the same one).
5. `npx wrangler d1 execute voip-bridge-d1 --remote --file=./migrations/0004_push_tokens.sql`
6. `npx wrangler deploy` (the account_id in `wrangler.toml` must match the
   logged-in Cloudflare account).

### Build machine
Needs JDK 17 or 21 (Gradle/AGP don't support the default JDK 25 here) and the
Android SDK (`ANDROID_HOME`; platform 36 + build-tools). Easiest is Android
Studio: `npx cap open android`, then Build → Build APK(s). Or from a shell:

    cd android && JAVA_HOME=/path/to/jdk21 ./gradlew assembleDebug

APK lands in `android/app/build/outputs/apk/debug/`. After changing
`capacitor.config.ts` or plugins, run `npx cap sync android` first.

### Phone
- Allow the mic and notification prompts on first launch.
- Android 14+: Settings → Apps → VoIP Bridge → allow **full-screen
  notifications**, or the call only shows as a heads-up banner on the lock screen.
- Turn off battery optimisation for the app (Settings → Battery → Unrestricted).
- Set the app's SIP account to the phone's own extension (202) in the dashboard.

## Asterisk dialplan (apply on the VPS — not applied automatically)

Before the inbound `Dial()`, wake the phone and give it a few seconds to
register. Adapt names to the live `extensions.conf`; back it up first and
`dialplan reload` afterwards.

    ; Only wake/wait when the phone isn't already registered.
    same => n,GotoIf($["${PJSIP_DIAL_CONTACTS(202)}" != ""]?dial)
    same => n,Set(WAKE=${CURL(https://voip-bridge.wandering-mode-c597.workers.dev/push/wake?secret=YOUR_PUSH_SECRET&extension=202&caller=${URIENCODE(${CALLERID(num)})})})
    same => n,Set(TRIES=0)
    same => n,While($["${PJSIP_DIAL_CONTACTS(202)}" = "" & ${TRIES} < 8])
    same => n,Wait(1)
    same => n,Set(TRIES=$[${TRIES} + 1])
    same => n,EndWhile
    same => n(dial),Dial(PJSIP/200&PJSIP/201&PJSIP/202&PJSIP/+66926181049@voipms,30)

Trade-offs:
- The other extensions and the mobile leg ring up to 8s later when the phone
  needs waking. Alternative: keep the `Dial()` as-is and add a second dial
  attempt for 202 after the wake (more complex; ask if wanted).
- A backgrounded app can leave a stale registration (expires=3600), so
  Asterisk sees a contact and skips the wake, then rings a dead socket.
  Fix options: lower `expires` in `initSoftphone`, or unregister when the app
  is paused (Capacitor `App` plugin `pause` event).
