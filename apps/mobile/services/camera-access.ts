// Camera access and barcode scanning rules shared by the barcode scanners and the photo camera.

export type CameraPermissionLike = { granted: boolean; canAskAgain: boolean; status?: string } | null | undefined;
export type CameraPlatform = 'android' | 'ios' | 'web' | string;

export type CameraAccess =
  | { state: 'checking' }
  | { state: 'granted' }
  | { state: 'ask'; message: string; action: 'allow'; actionLabel: string }
  | { state: 'blocked'; message: string; action: 'settings' | 'retry'; actionLabel: string };

/** Formats the scanners read: retail barcodes (EAN, UPC), common shelf labels (Code 128, Code 39) and QR codes. */
export const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

/** Longest barcode a product can store (the product form's limit). */
export const BARCODE_MAX_LENGTH = 100;

/**
 * What to show before the camera can open. Once access was refused and the system will not ask again,
 * phones can only turn it back on in the app's settings; browsers keep that choice in the site settings,
 * which a page cannot open, so web offers to try again instead.
 */
export function cameraAccess(permission: CameraPermissionLike, platform: CameraPlatform, purpose: 'scan' | 'photo'): CameraAccess {
  if (!permission) return { state: 'checking' };
  if (permission.granted) return { state: 'granted' };
  const task = purpose === 'scan' ? 'scan barcodes' : 'take photos';
  const fallback = purpose === 'scan' ? ' You can still type the barcode.' : '';
  if (permission.canAskAgain && permission.status !== 'denied') {
    return { state: 'ask', message: `Allow camera access to ${task}.${fallback}`, action: 'allow', actionLabel: 'Allow camera' };
  }
  if (permission.canAskAgain) {
    return { state: 'ask', message: `Camera access was refused. Allow it to ${task}.${fallback}`, action: 'allow', actionLabel: 'Allow camera' };
  }
  if (platform === 'web') {
    return { state: 'blocked', message: `Camera access is blocked for this site. Allow the camera in your browser's site settings, then try again.${fallback}`, action: 'retry', actionLabel: 'Try again' };
  }
  return { state: 'blocked', message: `Camera access was refused. Turn on Camera in Invento's settings to ${task}.${fallback}`, action: 'settings', actionLabel: 'Open settings' };
}

/** The code a scan read, trimmed; null when it is empty or too long to store as a barcode. */
export function scannedCode(data: string | null | undefined): string | null {
  const code = (data ?? '').trim();
  return code && code.length <= BARCODE_MAX_LENGTH ? code : null;
}

/** The product a scanned code belongs to, by barcode first and then by SKU (SKUs are stored in capitals). */
export function productForCode<T extends { barcode?: string | null; sku: string }>(products: T[], code: string): T | undefined {
  return products.find((product) => product.barcode === code) ?? products.find((product) => product.sku.toUpperCase() === code.toUpperCase());
}

/** Another product that already uses this barcode (barcodes are unique in a shop, including inactive products). */
export function barcodeOwner<T extends { id: string; barcode?: string | null }>(products: T[], code: string, currentId?: string): T | undefined {
  const wanted = code.trim();
  if (!wanted) return undefined;
  return products.find((product) => product.id !== currentId && product.barcode?.trim() === wanted);
}

/**
 * Tracks the duplicate check started by a barcode scan. Each scan, edit or reset makes earlier
 * checks stale, so a slow answer cannot put its warning under a different barcode.
 */
export function createBarcodeCheck() {
  let latest = 0;
  return {
    /** Starts a check for a scanned code and returns its token. */
    start: () => ++latest,
    /** Makes any check in flight stale (the field was edited or reset). */
    cancel: () => { latest += 1; },
    /** Whether the check with this token is still the newest one. */
    isCurrent: (token: number) => token === latest,
  };
}
