import { describe, expect, it } from 'vitest';
import { barcodeOwner, cameraAccess, productForCode, scannedCode } from './camera-access';

describe('camera access', () => {
  it('waits while the permission is being read', () => {
    expect(cameraAccess(null, 'android', 'scan')).toEqual({ state: 'checking' });
  });
  it('opens the camera once access is granted', () => {
    expect(cameraAccess({ granted: true, canAskAgain: true, status: 'granted' }, 'android', 'scan')).toEqual({ state: 'granted' });
  });
  it('asks first, and asks again after one refusal while the system still allows it', () => {
    expect(cameraAccess({ granted: false, canAskAgain: true, status: 'undetermined' }, 'android', 'scan')).toEqual({ state: 'ask', action: 'allow', actionLabel: 'Allow camera', message: 'Allow camera access to scan barcodes. You can still type the barcode.' });
    expect(cameraAccess({ granted: false, canAskAgain: true, status: 'denied' }, 'android', 'photo')).toMatchObject({ state: 'ask', action: 'allow', message: 'Camera access was refused. Allow it to take photos.' });
  });
  it('sends phones to the app settings when the system will not ask again', () => {
    expect(cameraAccess({ granted: false, canAskAgain: false, status: 'denied' }, 'android', 'scan')).toEqual({ state: 'blocked', action: 'settings', actionLabel: 'Open settings', message: "Camera access was refused. Turn on Camera in Invento's settings to scan barcodes. You can still type the barcode." });
    expect(cameraAccess({ granted: false, canAskAgain: false, status: 'denied' }, 'ios', 'photo')).toMatchObject({ action: 'settings', message: "Camera access was refused. Turn on Camera in Invento's settings to take photos." });
  });
  it('points browsers to the site settings, which a page cannot open', () => {
    expect(cameraAccess({ granted: false, canAskAgain: false, status: 'denied' }, 'web', 'scan')).toMatchObject({ state: 'blocked', action: 'retry', actionLabel: 'Try again' });
  });
});

describe('scanned codes', () => {
  it('trims the code and refuses empty or over-long reads', () => {
    expect(scannedCode(' 8901234567890\n')).toBe('8901234567890');
    expect(scannedCode('   ')).toBeNull();
    expect(scannedCode(undefined)).toBeNull();
    expect(scannedCode('9'.repeat(101))).toBeNull();
    expect(scannedCode('9'.repeat(100))).toHaveLength(100);
  });
  it('finds the product by barcode first, then by SKU in any case', () => {
    const products = [
      { id: 'a', sku: '8901234567890', barcode: null },
      { id: 'b', sku: 'HANDLE-10', barcode: '8901234567890' },
    ];
    expect(productForCode(products, '8901234567890')?.id).toBe('b');
    expect(productForCode(products, 'handle-10')?.id).toBe('b');
    expect(productForCode(products, '000')).toBeUndefined();
  });
  it('names another product that already uses a barcode, ignoring the one being edited', () => {
    const products = [{ id: 'a', barcode: '111' }, { id: 'b', barcode: null }];
    expect(barcodeOwner(products, ' 111 ')?.id).toBe('a');
    expect(barcodeOwner(products, '111', 'a')).toBeUndefined();
    expect(barcodeOwner(products, '')).toBeUndefined();
  });
});
