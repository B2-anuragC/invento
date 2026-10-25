#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_PUBLIC_LOCAL_ONLY=true
export CI=1
if [[ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  echo 'Set ANDROID_HOME to your Android SDK directory before building.' >&2
  exit 1
fi
npx expo prebuild --platform android --no-install
(
  cd android
  ./gradlew :app:assembleRelease --no-daemon --max-workers=4 -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
)
mkdir -p ../../builds
cp android/app/build/outputs/apk/release/app-release.apk ../../builds/invento-local-only.apk
shasum -a 256 ../../builds/invento-local-only.apk
