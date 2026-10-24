#!/usr/bin/env bash
# Builds a signed release APK and publishes it to public/app (the install page
# at /app/ and the dashboard's "update available" prompt read version.json).
# Bumps versionCode in android/app/version.properties; commit that afterwards.
# Then `npm run deploy` to put it live.
#
# Needs the release key: ~/Android/keys/voip-bridge-keystore.properties (or
# $VOIP_BRIDGE_KEYSTORE). Losing it means every phone has to uninstall and
# reinstall, so keep a backup of that file and the .jks it points at.
# Usage: scripts/android-release.sh ["what changed, shown on the install page"]
set -euo pipefail
export JAVA_HOME="$HOME/Android/jdk-21"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd "$(dirname "$0")/.."

KEYPROPS="${VOIP_BRIDGE_KEYSTORE:-$HOME/Android/keys/voip-bridge-keystore.properties}"
[ -f "$KEYPROPS" ] || { echo "Release key not found: $KEYPROPS" >&2; exit 1; }

VP=android/app/version.properties
code=$(( $(grep '^versionCode=' "$VP" | cut -d= -f2) + 1 ))
name="1.$code"
printf 'versionCode=%s\nversionName=%s\n' "$code" "$name" > "$VP"

npx cap sync android
(cd android && ./gradlew assembleRelease)

APK=android/app/build/outputs/apk/release/app-release.apk
APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner"
"$APKSIGNER" verify --print-certs "$APK" | grep -m1 "SHA-256"
mkdir -p public/app
cp "$APK" public/app/voip-bridge.apk
NOTES="${1:-}" CODE="$code" NAME="$name" SIZE=$(stat -c %s "$APK") SHA=$(sha256sum "$APK" | cut -d' ' -f1) node -e '
  const e = process.env;
  require("fs").writeFileSync("public/app/version.json", JSON.stringify({
    versionCode: +e.CODE, versionName: e.NAME, size: +e.SIZE, sha256: e.SHA,
    builtAt: new Date().toISOString(), notes: e.NOTES,
  }, null, 2) + "\n");'
echo "Published VoIP Bridge $name (versionCode $code) to public/app. Next: npm run deploy, and commit $VP."
