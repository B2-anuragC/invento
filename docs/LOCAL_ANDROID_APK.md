# Local-only Android APK

Build with `npm --prefix frontend run build:apk:local` after setting `ANDROID_HOME` to an Android SDK installation. The script sets `EXPO_PUBLIC_LOCAL_ONLY=true` for native generation and JavaScript bundling, then writes `builds/invento-local-only.apk`. It packages both ARM64 and ARMv7 and uses Expo's generated development signing key for sideload testing; this is not a Play Store signing setup.

The app opens local business setup without a cloud login. Products, contacts, opening stock, bills and payments are stored in private SQLite storage, with local photos in the application's document directory. Closing/reopening the app retains these records. Android internet permission and automatic cloud backups are disabled for this build. Manual share actions still open an external app at the user's request. Uninstalling the app or clearing its data removes its local records.

Local mode uses a separate session key and never sends API requests. Existing server mode requires `EXPO_PUBLIC_API_URL` and does not have a hard-coded address fallback. Changing build modes requires rerunning native generation so permissions match the JavaScript mode. The regular developer commands do not implicitly enable local-only mode.

Local domain writes and their stored snapshot commit together. The existing durable outbox processes local writes on the device; its request IDs prevent duplicates after a restart or lost acknowledgement. No initial server download is required. Team invitation and other unsupported server-only operations return a local-mode explanation.
