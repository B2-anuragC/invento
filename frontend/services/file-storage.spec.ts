import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from './api';
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'local-asset' }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/', EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }: { from: string; to: string }) => { disk.set(to, disk.get(from) ?? 'compressed-bytes'); },
  writeAsStringAsync: async (path: string, value: string) => { disk.set(path, value); },
  readAsStringAsync: async (path: string) => { if (!disk.has(path)) throw new Error('Missing file'); return disk.get(path)!; },
  getInfoAsync: async (path: string) => ({ exists: disk.has(path) }),
  deleteAsync: async (path: string) => { disk.delete(path); },
}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ resize: () => {}, renderAsync: async () => ({ width: 1200, height: 600, saveAsync: async () => ({ uri: 'file:///cache/compressed.jpg' }) }) }) },
}));
import { configureFileStorage, storePickedFile, resolveLocalFile, resolveUploadPayload } from './file-storage';

describe('Native physical uploads', () => {
  const session = { user: { id: 'user-a' }, businessId: 'business-a' } as AppSession;
  const remote = { name: 'photo.webp', mimeType: 'image/webp', url: `/files/${'a'.repeat(64)}/original`, thumbnailUrl: `/files/${'a'.repeat(64)}/thumbnail` };
  const transport = vi.fn();
  beforeEach(() => {
    disk.clear(); transport.mockReset(); transport.mockResolvedValue(remote);
    configureFileStorage(transport, () => session, 'http://localhost:3000/api');
  });
  it('stores image files and reference metadata offline, then reuses upload references on retry', async () => {
    const picked = await storePickedFile({ uri: 'file:///picked/photo.png', name: 'photo.png', mimeType: 'image/png' }, 'product');
    expect(picked.url).toMatch(/^file:\/\/\/app\/uploads\//);
    expect(picked.thumbnailUrl).toMatch(/thumbnail.jpg$/);
    expect(transport).not.toHaveBeenCalled();
    const metadata = [...disk.entries()].find(([path]) => path.endsWith('metadata.json'))![1];
    expect(metadata).not.toContain('base64');
    expect(JSON.parse(metadata).mimeType).toBe('image/jpeg');
    expect(await resolveLocalFile(picked.url, session)).toEqual(remote);
    expect(await resolveLocalFile(picked.url, session)).toEqual(remote);
    expect(transport).toHaveBeenCalledTimes(1);
    const payload = await resolveUploadPayload({ payload: { imageOriginal: picked.url, imageThumbnail: picked.thumbnailUrl } }, session);
    expect(payload).toEqual({ payload: { imageOriginal: remote.url, imageThumbnail: remote.thumbnailUrl } });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(resolveLocalFile(picked.url, { ...session, businessId: 'other-business' })).rejects.toThrow('another business');
  });
  it('keeps PDF bytes and a physical document preview until upload', async () => {
    disk.set('file:///picked/bill.pdf', 'pdf-bytes');
    const file = await storePickedFile({ uri: 'file:///picked/bill.pdf', name: 'bill.pdf', mimeType: 'application/pdf' }, 'purchase');
    expect(disk.get(file.url)).toBe('pdf-bytes');
    expect(file.thumbnailUrl).toMatch(/thumbnail.png$/);
    expect(transport).not.toHaveBeenCalled();
    expect(await resolveUploadPayload({ attachment: file }, session)).toEqual({ attachment: remote });
  });
});
