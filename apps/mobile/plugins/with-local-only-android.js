const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withLocalOnlyAndroid(config) {
  if (process.env.EXPO_PUBLIC_LOCAL_ONLY !== 'true') return config;
  return withAndroidManifest(config, (result) => {
    const manifest = result.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    // Also remove permissions contributed by dependency manifests at merge time.
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter((entry) => entry.$['android:name'] !== 'android.permission.INTERNET');
    manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.INTERNET', 'tools:node': 'remove' } });
    const application = manifest.application[0].$;
    application['android:allowBackup'] = 'false';
    application['android:fullBackupContent'] = 'false';
    return result;
  });
};
