import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from './api';
const mocks = vi.hoisted(() => ({ storage: new Map<string, string>(), pending: vi.fn(), launch: vi.fn(), copy: vi.fn(), remove: vi.fn(), permission: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'capture-a' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.storage.set(key, value); },
  removeItem: async (key: string) => { mocks.storage.delete(key); },
} }));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///app/', makeDirectoryAsync: async () => {}, copyAsync: mocks.copy, deleteAsync: mocks.remove }));
vi.mock('expo-image-picker', () => ({ getPendingResultAsync: mocks.pending, launchCameraAsync: mocks.launch, requestCameraPermissionsAsync: mocks.permission }));
const session = { user: { id: 'user-a' }, businessId: 'business-a' } as AppSession;
const result = { canceled: false, assets: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', width: 4000, height: 3000 }] };
const key = 'invento.camera.v1';
describe('Android camera recovery', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.storage.clear(); mocks.permission.mockResolvedValue({ granted: true }); mocks.pending.mockResolvedValue(null); mocks.copy.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined); });
  it('persists context before leaving the app, then restores a native pending result after a JS restart', async () => {
    let service = await import('./camera-recovery');
    mocks.launch.mockImplementation(async () => {
      expect(JSON.parse(mocks.storage.get(key)!)).toMatchObject({ userId: 'user-a', businessId: 'business-a', kind: 'product', route: '/product/new' });
      throw new Error('Activity destroyed');
    });
    await expect(service.capturePhoto(session, 'product', '/product/new')).rejects.toThrow('Activity destroyed');
    vi.resetModules();
    service = await import('./camera-recovery');
    mocks.pending.mockResolvedValue(result);
    await service.recoverCameraPhoto();
    expect(mocks.copy).toHaveBeenCalledWith({ from: 'file:///cache/photo.jpg', to: 'file:///app/camera-recovery/capture-a' });
    expect(service.matchesCapture(service.getCameraRecovery(), session, 'product', '/product/new')).toBe(true);
    expect(service.matchesCapture(service.getCameraRecovery(), session, 'product', '/product/other')).toBe(false);
    expect(service.matchesCapture(service.getCameraRecovery(), { ...session, businessId: 'other' })).toBe(false);
    expect(service.matchesCapture(service.getCameraRecovery(), { ...session, user: { ...session.user, id: 'other' } })).toBe(false);
    vi.resetModules();
    service = await import('./camera-recovery');
    await service.recoverCameraPhoto();
    expect(service.getCameraRecovery()?.asset?.uri).toBe('file:///app/camera-recovery/capture-a');
    expect(mocks.pending).toHaveBeenCalledTimes(1);
    await service.clearCameraPhoto(session);
    expect(service.getCameraRecovery()).toBeNull();
    expect(mocks.storage.has(key)).toBe(false);
  });
  it('retains a normal camera result until acknowledged and does not allow another capture to overwrite it', async () => {
    const service = await import('./camera-recovery');
    mocks.launch.mockResolvedValue(result);
    expect(await service.capturePhoto(session, 'purchase', '/purchase/create')).toMatchObject({ uri: 'file:///app/camera-recovery/capture-a' });
    await expect(service.capturePhoto(session, 'sale', '/sale/create')).rejects.toThrow('recovered photo');
    await service.clearCameraPhoto({ ...session, businessId: 'other' });
    expect(service.getCameraRecovery()).not.toBeNull();
  });
  it('clears cancellations and preserves context if the native recovery API throws', async () => {
    const service = await import('./camera-recovery');
    mocks.launch.mockResolvedValue({ canceled: true, assets: null });
    expect(await service.capturePhoto(session, 'customer', '/people/customers/new')).toBeNull();
    expect(mocks.storage.has(key)).toBe(false);
    mocks.launch.mockRejectedValue(new Error('Interrupted'));
    await expect(service.capturePhoto(session, 'customer', '/people/customers/new')).rejects.toThrow();
    mocks.pending.mockRejectedValue(new Error('Not ready'));
    await expect(service.recoverCameraPhoto()).rejects.toThrow('Not ready');
    expect(mocks.storage.has(key)).toBe(true);
    mocks.pending.mockResolvedValue(result);
    await service.recoverCameraPhoto();
    expect(service.getCameraRecovery()?.asset).toBeDefined();
  });
  it('accepts an in-app camera result without launching the external camera', async () => {
    const service = await import('./camera-recovery');
    const camera = vi.fn().mockImplementation(async () => {
      expect(JSON.parse(mocks.storage.get(key)!)).toMatchObject({ source: 'in-app' });
      return result;
    });
    await service.capturePhoto(session, 'product', '/product/new', camera);
    expect(camera).toHaveBeenCalledOnce();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(service.getCameraRecovery()?.asset?.uri).toBe('file:///app/camera-recovery/capture-a');
  });
  it('does not consume unrelated picker results for an interrupted in-app capture', async () => {
    let service = await import('./camera-recovery');
    await expect(service.capturePhoto(session, 'product', '/product/new', async () => { throw new Error('Restart'); })).rejects.toThrow('Restart');
    vi.resetModules();
    service = await import('./camera-recovery');
    mocks.pending.mockResolvedValue(result);
    await service.recoverCameraPhoto();
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(service.getCameraRecovery()?.asset).toBeUndefined();
  });

});
