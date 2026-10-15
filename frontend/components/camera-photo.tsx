import { InAppCamera } from '@/components/in-app-camera';
import { useCameraPermissions } from 'expo-camera';
import type { ImagePickerResult } from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect, usePathname, useRouter, type Href } from 'expo-router';
import { appSession } from '@/services/api';
import { storePickedFile, type StoredFile, type UploadKind } from '@/services/file-storage';
import { capturePhoto, clearCameraPhoto, getCameraRecovery, matchesCapture, recoverCameraPhoto, subscribeCameraRecovery } from '@/services/camera-recovery';

export function CameraRecoveryNotice() {
  const photo = useSyncExternalStore(subscribeCameraRecovery, getCameraRecovery, getCameraRecovery);
  const route = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    const recover = () => { void recoverCameraPhoto().then(() => setError('')).catch(() => setError('Could not recover the camera photo. Reopen its form to try again.')); };
    recover();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') recover(); });
    return () => listener.remove();
  }, [route]);
  if (Platform.OS !== 'android' || !appSession.current?.businessId) return null;
  if (error) return <Text accessibilityRole="alert" style={{ padding: 12, color: '#A74737' }}>{error}</Text>;
  if (!matchesCapture(photo, appSession.current) || photo?.route === route) return null;
  return <Pressable accessibilityRole="button" onPress={() => router.push(photo!.route as Href)} style={{ padding: 12, backgroundColor: '#EDF4F0', minHeight: 44 }}><Text>A camera photo was recovered. Tap to return to its form.</Text></Pressable>;
}

export function CameraPhoto({ kind, onChange, onBusy, disabled }: { kind: UploadKind; onChange: (file: StoredFile) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const photo = useSyncExternalStore(subscribeCameraRecovery, getCameraRecovery, getCameraRecovery);
  const route = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const pendingCapture = useRef<((result: ImagePickerResult) => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pendingCapture.current?.({ canceled: true, assets: null }); pendingCapture.current = null; };
  }, []);
  useFocusEffect(useCallback(() => () => {
    pendingCapture.current?.({ canceled: true, assets: null });
    pendingCapture.current = null;
    setCameraOpen(false);
  }, []));
  const finishCapture = (result: ImagePickerResult) => {
    pendingCapture.current?.(result);
    pendingCapture.current = null;
    setCameraOpen(false);
  };
  const openCamera = async (): Promise<ImagePickerResult> => {
    const allowed = permission?.granted || (await requestPermission()).granted;
    if (!allowed) throw new Error('Allow camera access in your device settings to take a photo.');
    if (!mounted.current) return { canceled: true, assets: null };
    return new Promise((resolve) => { pendingCapture.current = resolve; setCameraOpen(true); });
  };
  const available = matchesCapture(photo, appSession.current, kind, route);
  const attachPhoto = async (recovered: boolean) => {
    const session = appSession.current;
    if (!session || disabled || busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const asset = recovered ? photo?.asset : await capturePhoto(session, kind, route, Platform.OS === 'web' ? undefined : openCamera);
      if (!asset || !mounted.current) return;
      if (appSession.current?.user.id !== session.user.id || appSession.current?.businessId !== session.businessId) throw new Error('Return to the original business to attach this photo.');
      const stored = await storePickedFile({ uri: asset.uri, name: 'name' in asset ? asset.name : asset.fileName ?? `${kind}-photo.jpg`, mimeType: asset.mimeType ?? 'image/jpeg', width: asset.width, height: asset.height, ...('file' in asset ? { file: asset.file, size: asset.fileSize } : {}) }, kind);
      if (appSession.current?.user.id !== session.user.id || appSession.current?.businessId !== session.businessId) throw new Error('Return to the original business to attach this photo.');
      if (!mounted.current) return;
      onChange(stored);
      await clearCameraPhoto(session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not attach the camera photo.'); }
    finally { setBusy(false); onBusy(false); }
  };
  return <View>
    {cameraOpen ? <InAppCamera onResult={finishCapture} /> : null}
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={() => void attachPhoto(available)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#176B50', fontWeight: '700' }}>{busy ? 'Preparing photo…' : available ? 'Use recovered photo' : 'Take photo'}</Text></Pressable>
    {available ? <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={() => { const session = appSession.current; if (session) void clearCameraPhoto(session).catch(() => setError('Could not discard this photo.')); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text>Discard recovered photo</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: '#A74737' }}>{error}</Text> : null}
  </View>;
}
