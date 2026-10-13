import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import type { AppSession } from './api';

export type UploadKind = 'product' | 'customer' | 'sale' | 'purchase';
export type StoredFile = { name: string; mimeType: string; url: string; thumbnailUrl?: string };
type PickedFile = { uri: string; name: string; mimeType: string; file?: Blob; size?: number };
type LocalMetadata = StoredFile & { kind: UploadKind; businessId: string; userId: string };
type Transport = <T>(path: string, options: RequestInit, session: AppSession) => Promise<T>;
let uploadTransport: Transport;
let sessionReader: () => AppSession | null;
let renewFileSession: (() => Promise<void>) | undefined;
let apiBase = '';
export function configureFileStorage(transport: Transport, current: () => AppSession | null, base: string, renew?: () => Promise<void>) { renewFileSession = renew; uploadTransport = transport; sessionReader = current; apiBase = base; }
function current() { const session = sessionReader?.(); if (!session?.businessId) throw new Error('Sign in and select a business before attaching a file.'); return session; }
export function fileSource(uri: string) {
  if (!uri.startsWith('/files/')) return { uri };
  const session = current();
  return { uri: `${apiBase}${uri}`, headers: { Authorization: `Bearer ${session.accessToken}`, 'X-Business-Id': session.businessId! } };
}
export function thumbnailFor(uri: string) { return uri.startsWith('/files/') ? uri.replace(/\/original$/, '/thumbnail') : uri.startsWith('file:') ? uri.replace(/\/original$/, '/thumbnail.jpg') : uri; }
async function readBase64(file: PickedFile) {
  if (Platform.OS !== 'web') return FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  const blob = file.file ?? await (await fetch(file.uri)).blob();
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the file.')); reader.readAsDataURL(blob); });
}
async function upload(file: PickedFile, kind: UploadKind, session: AppSession): Promise<StoredFile> {
  const result = await uploadTransport<StoredFile>('/files', { method: 'POST', body: JSON.stringify({ name: file.name, mimeType: file.mimeType, base64: await readBase64(file), kind }) }, session);
  return { name: result.name, mimeType: result.mimeType, url: result.url, thumbnailUrl: result.thumbnailUrl };
}
export async function storePickedFile(file: PickedFile, kind: UploadKind): Promise<StoredFile> {
  const session = current();
  if (file.size && file.size > 10 * 1024 * 1024) throw new Error('Choose a file up to 10 MB.');
  if (Platform.OS === 'web') return upload(file, kind, session);
  if (!FileSystem.documentDirectory) throw new Error('App file storage is unavailable.');
  const scope = `${session.user.id}-${session.businessId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = `${FileSystem.documentDirectory}uploads/${scope}/${randomUUID()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  let mimeType = file.mimeType;
  let original = file.uri;
  let thumbnailUrl: string | undefined;
  if (mimeType.startsWith('image/')) {
    const context = ImageManipulator.ImageManipulator.manipulate(file.uri);
    const source = await context.renderAsync();
    if (source.width * source.height > 40000000) throw new Error('Choose an image under 40 megapixels.');
    context.resize(source.width >= source.height ? { width: Math.min(source.width, 1600) } : { height: Math.min(source.height, 1600) });
    const large = await context.renderAsync();
    const compressed = await large.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
    original = compressed.uri; mimeType = 'image/jpeg';
    context.resize(source.width >= source.height ? { width: Math.min(source.width, 320) } : { height: Math.min(source.height, 320) });
    const small = await context.renderAsync();
    const preview = await small.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.65 });
    thumbnailUrl = `${dir}thumbnail.jpg`;
    await FileSystem.copyAsync({ from: preview.uri, to: thumbnailUrl });
  }
  if (!thumbnailUrl) {
    thumbnailUrl = `${dir}thumbnail.png`;
    await FileSystem.writeAsStringAsync(thumbnailUrl, 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABQCAYAAACpv3NFAAAACXBIWXMAAAsTAAALEwEAmpwYAAABZ0lEQVR4nO2YQUpEMRAF3y1yFReCHmGuIQ16BUHmjoIbcSGCDoyafcssZk7wk0rMa6j1fxRJd+frUI+5MqID0IgOQCM6AI3oADSiA9CIDkAjOgCN6AA0ogPQiA4wtYASu2ZcPd7l8/vrugJK7PL6KfLl4218AVvX1+933u4fupwEjSigpwSNKqCXBI0soIcEjS6gtQTNIKClBM0ioJUEzSSghQTNJuBUnz/HvNnfX5al5QScJZy/v6SAU1lA+ASkr0C4B6SbYPUUSI/BOuAeUDb6NTbtFSirC2hdFhA+AekrEO4B6SZYPQVyyDFYVt8DyuoCWpcFhE9A+gqEe0C6CVZPgRxyDJaN5v20Y7CsLqB1WUD4BKSvQLgHpJtg9RRIj8HqPSC9CFVvgulVuPotkH4MVb8Gs+tzuMDgm2BZVcDhHyA6AI3oADSiA9CIDkAjOgCN6AA0ogPQiA5AIzoAjegANKID0PwBIlveLtBkp7YAAAAASUVORK5CYII=', { encoding: FileSystem.EncodingType.Base64 });
  }
  const url = `${dir}original`;
  await FileSystem.copyAsync({ from: original, to: url });
  const metadata: LocalMetadata = { name: file.name.slice(0, 160), mimeType, url, thumbnailUrl, kind, businessId: session.businessId!, userId: session.user.id };
  await FileSystem.writeAsStringAsync(`${dir}metadata.json`, JSON.stringify(metadata));
  return { name: metadata.name, mimeType, url, thumbnailUrl };
}
export async function resolveLocalFile(uri: string, session: AppSession): Promise<StoredFile> {
  const dir = uri.slice(0, uri.lastIndexOf('/') + 1);
  if (!FileSystem.documentDirectory || !dir.startsWith(`${FileSystem.documentDirectory}uploads/`) || !uri.endsWith('/original')) throw new Error('Invalid local upload reference.');
  const metadata: LocalMetadata = JSON.parse(await FileSystem.readAsStringAsync(`${dir}metadata.json`));
  if (metadata.userId !== session.user.id || metadata.businessId !== session.businessId) throw new Error('This attachment belongs to another business.');
  const remote = `${dir}remote.json`;
  if ((await FileSystem.getInfoAsync(remote)).exists) return JSON.parse(await FileSystem.readAsStringAsync(remote));
  const result = await upload({ uri, name: metadata.name, mimeType: metadata.mimeType }, metadata.kind, session);
  await FileSystem.writeAsStringAsync(remote, JSON.stringify(result));
  return result;
}
export async function resolveUploadPayload(value: unknown, session: AppSession): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((entry) => resolveUploadPayload(entry, session)));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = { ...value };
  if (typeof result.imageOriginal === 'string' && result.imageOriginal.startsWith('file:')) {
    const file = await resolveLocalFile(result.imageOriginal, session); result.imageOriginal = file.url; result.imageThumbnail = file.thumbnailUrl;
  }
  if (typeof result.referenceImage === 'string' && result.referenceImage.startsWith('file:')) result.referenceImage = (await resolveLocalFile(result.referenceImage, session)).url;
  if (typeof result.url === 'string' && result.url.startsWith('file:')) return resolveLocalFile(result.url, session);
  for (const key of Object.keys(result)) if (typeof result[key] === 'object') result[key] = await resolveUploadPayload(result[key], session);
  return result;
}
export async function downloadStoredFile(url: string): Promise<Blob> {
  const relative = url.startsWith(apiBase + '/files/') ? url.slice(apiBase.length) : url;
  let source = fileSource(relative);
  let response = await fetch(source.uri, { headers: source.headers });
  if (response.status === 401 && renewFileSession) { await renewFileSession(); source = fileSource(relative); response = await fetch(source.uri, { headers: source.headers }); }
  if (!response.ok) throw new Error('Could not download the file.');
  return response.blob();
}

export async function cachedImageFile(remote: string) {
  const session = current();
  const relative = remote.startsWith(apiBase) ? remote.slice(apiBase.length) : remote;
  const match = /^\/files\/([a-f0-9]{64})\/(original|thumbnail)$/.exec(relative);
  if (!match || !FileSystem.documentDirectory) throw new Error('Invalid image URL.');
  const scope = `${session.user.id}-${session.businessId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = `${FileSystem.documentDirectory}uploads/cache/${scope}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const uri = `${dir}${match[1]}-${match[2]}`;
  if ((await FileSystem.getInfoAsync(uri)).exists) return uri;
  let source = fileSource(relative);
  let result = await FileSystem.downloadAsync(source.uri, uri, { headers: source.headers });
  if (result.status === 401 && renewFileSession) { await renewFileSession(); source = fileSource(relative); result = await FileSystem.downloadAsync(source.uri, uri, { headers: source.headers }); }
  if (result.status !== 200) { await FileSystem.deleteAsync(uri, { idempotent: true }); throw new Error('Could not download image.'); }
  return uri;
}

// Upgrade older snapshots and drafts before persisting them again. Bytes exist
// only while writing a physical file; SQLite and AsyncStorage keep references.
export async function localizeLegacyUploads(value: unknown, session: AppSession): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((entry) => localizeLegacyUploads(entry, session)));
  if (!value || typeof value !== 'object') return value;
  const record: Record<string, unknown> = { ...value };
  const legacy = async (base64: string, mimeType: string, name: string, kind: UploadKind) => {
    if (Platform.OS === 'web') return uploadTransport<StoredFile>('/files', { method: 'POST', body: JSON.stringify({ name, mimeType, base64, kind }) }, session);
    if (!FileSystem.documentDirectory) throw new Error('App storage is unavailable.');
    const uri = `${FileSystem.documentDirectory}legacy-${randomUUID()}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    try { return await storePickedFile({ uri, name, mimeType }, kind); }
    finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
  };
  if (typeof record.imageOriginal === 'string' && record.imageOriginal.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(record.imageOriginal);
    if (!match) throw new Error('Invalid legacy product image.');
    const file = await legacy(match[2], match[1], 'product-photo', 'product'); record.imageOriginal = file.url; record.imageThumbnail = file.thumbnailUrl;
  }
  if (typeof record.referenceImage === 'string' && record.referenceImage.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(record.referenceImage);
    if (!match) throw new Error('Invalid legacy sale image.');
    record.referenceImage = (await legacy(match[2], match[1], 'sale-photo', 'sale')).url;
  }
  if (typeof record.base64 === 'string' && typeof record.name === 'string' && typeof record.mimeType === 'string') {
    const file = await legacy(record.base64, record.mimeType, record.name, 'purchase');
    return { name: file.name, mimeType: file.mimeType, url: file.url, thumbnailUrl: file.thumbnailUrl };
  }
  for (const key of Object.keys(record)) if (typeof record[key] === 'object') record[key] = await localizeLegacyUploads(record[key], session);
  return record;
}
