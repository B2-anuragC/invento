import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';
import type { AppSession } from './api';
import type { UploadKind } from './file-storage';

const key = 'invento.camera.v1';
type Capture = { source?: 'in-app' | 'external'; id: string; userId: string; businessId: string; kind: UploadKind; route: string; asset?: { uri: string; width: number; height: number; name: string; mimeType: string } };
let snapshot: Capture | null = null;
let active = false;
let recovery: Promise<void> | undefined;
const listeners = new Set<() => void>();
export const subscribeCameraRecovery = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getCameraRecovery = () => snapshot;
async function persist(value: Capture | null) {
  if (value) await AsyncStorage.setItem(key, JSON.stringify(value));
  else await AsyncStorage.removeItem(key);
  snapshot = value;
  listeners.forEach((listener) => listener());
}
export function matchesCapture(value: Capture | null, session: AppSession | null, kind?: UploadKind, route?: string) {
  return Boolean(value?.asset && session?.businessId && value.userId === session.user.id && value.businessId === session.businessId && (!kind || value.kind === kind) && (!route || value.route === route));
}
async function saveResult(context: Capture, result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null) {
  if (!result) return;
  if ('code' in result) throw new Error(result.message || 'The camera could not return the photo.');
  if (result.canceled || !result.assets[0]) { await persist(null); return; }
  const asset = result.assets[0];
  if (!FileSystem.documentDirectory) throw new Error('App file storage is unavailable.');
  const directory = `${FileSystem.documentDirectory}camera-recovery/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}${context.id}`;
  // Copy out of the picker cache before saving the recovery record.
  await FileSystem.copyAsync({ from: asset.uri, to: uri });
  await persist({ ...context, asset: { uri, width: asset.width, height: asset.height, name: asset.fileName ?? `${context.kind}-photo.jpg`, mimeType: asset.mimeType ?? 'image/jpeg' } });
}
export async function recoverCameraPhoto() {
  if (Platform.OS !== 'android' || active) return;
  if (recovery) return recovery;
  recovery = (async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const context = JSON.parse(raw) as Capture;
    if (!context.id || !context.userId || !context.businessId || !['product', 'customer', 'sale', 'purchase'].includes(context.kind) || !context.route?.startsWith('/')) throw new Error('Invalid saved camera context.');
    snapshot = context;
    listeners.forEach((listener) => listener());
    if (!context.asset && context.source !== 'in-app') await saveResult(context, await ImagePicker.getPendingResultAsync());
  })().finally(() => { recovery = undefined; });
  return recovery;
}
export async function capturePhoto(session: AppSession, kind: UploadKind, route: string, camera?: () => Promise<ImagePicker.ImagePickerResult>) {
  if (active) throw new Error('A camera capture is already in progress.');
  await recoverCameraPhoto();
  if (active) throw new Error('A camera capture is already in progress.');
  if (snapshot?.asset) throw new Error('Use or discard the recovered photo before taking another.');
  if (!camera && Platform.OS !== 'web' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access in your device settings to take a photo.');
  if (!session.businessId) throw new Error('Select a business before taking a photo.');
  active = true;
  try {
    const context: Capture = { source: camera ? 'in-app' : 'external', id: randomUUID(), userId: session.user.id, businessId: session.businessId, kind, route };
    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
      return result.canceled ? null : result.assets[0];
    }
    await persist(context);
    const result = camera ? await camera() : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false, base64: false, exif: false });
    await saveResult(context, result);
    return snapshot?.asset ?? null;
  } finally { active = false; }
}
export async function clearCameraPhoto(session: AppSession) {
  if (!snapshot || snapshot.userId !== session.user.id || snapshot.businessId !== session.businessId) return;
  const uri = snapshot.asset?.uri;
  await persist(null);
  // Attachment storage has its own copy before the recovery source is removed.
  if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
