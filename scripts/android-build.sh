#!/usr/bin/env bash
# Builds the debug APK with the project-local JDK 21 + Android SDK in ~/Android
# (the system default JDK is too new for Android's Gradle plugin).
# Usage: scripts/android-build.sh [gradle task, default assembleDebug]
set -euo pipefail
export JAVA_HOME="$HOME/Android/jdk-21"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd "$(dirname "$0")/.."
npx cap sync android
cd android
./gradlew "${1:-assembleDebug}"
echo "APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
