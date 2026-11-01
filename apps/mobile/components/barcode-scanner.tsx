import { useCameraPermissions, CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/invento-ui';
import { BARCODE_TYPES, cameraAccess, scannedCode } from '@/services/camera-access';

/** Camera permission with the next step to offer; it is read again when the person returns from the settings app. */
export function useCameraAccess(purpose: 'scan' | 'photo') {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [error, setError] = useState('');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void getPermission().catch(() => undefined); });
    return () => listener.remove();
  }, [getPermission]);
  const access = cameraAccess(permission, Platform.OS, purpose);
  const act = async () => {
    setError('');
    try {
      if (access.state === 'blocked' && access.action === 'settings') await Linking.openSettings();
      else return (await requestPermission()).granted;
    } catch {
      setError(access.state === 'blocked' && access.action === 'settings' ? 'Could not open settings. Turn on Camera for Invento in the phone settings.' : 'Camera access is unavailable on this device.');
    }
    return false;
  };
  return { permission, access, act, error, requestPermission };
}

/** The message and button shown while the camera cannot open yet. */
export function CameraAccessPrompt({ access, act, error }: Pick<ReturnType<typeof useCameraAccess>, 'access' | 'act' | 'error'>) {
  if (access.state === 'granted') return null;
  if (access.state === 'checking') return <Text style={styles.meta}>Checking camera access…</Text>;
  return <View style={styles.prompt}>
    <Text accessibilityRole={access.state === 'blocked' ? 'alert' : undefined} style={styles.meta}>{access.message}</Text>
    <ActionButton title={access.actionLabel} onPress={() => void act()} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

/** Live barcode scanner. It reports one code per opening; the parent closes it on a scan. */
export function BarcodeScanner({ onScanned, hint = 'Point the camera at a product barcode.' }: { onScanned: (code: string) => void; hint?: string }) {
  const camera = useCameraAccess('scan');
  const done = useRef(false);
  const [unreadable, setUnreadable] = useState(false);
  if (camera.access.state !== 'granted') return <CameraAccessPrompt {...camera} />;
  return <View style={styles.prompt}>
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
      onBarcodeScanned={({ data }) => {
        if (done.current) return;
        const code = scannedCode(data);
        if (!code) { setUnreadable(true); return; }
        done.current = true;
        onScanned(code);
      }}
    />
    <Text style={styles.meta}>{unreadable ? 'That code is too long for a barcode. Try another code or type it.' : hint}</Text>
  </View>;
}

const styles = StyleSheet.create({
  prompt: { gap: 10 },
  camera: { height: 300, borderRadius: 12, overflow: 'hidden' },
  meta: { color: '#737B77', fontSize: 13, lineHeight: 19 },
  error: { color: '#A74737', fontSize: 13 },
});
