import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// A4 in points (72 per inch); the document's @page rule sets the margins.
const A4 = { width: 595, height: 842 };

/** Phones attach the PDF to any app through the system share sheet. */
export const canSharePdf = true;

/** Opens the system print dialog, which can also save a PDF. Closing it without printing is not an error. */
export async function printInvoice(html: string): Promise<void> {
  try {
    await Print.printAsync({ html, ...A4 });
  } catch (error) {
    // iOS rejects when the dialog closes without printing; Android resolves.
    if (/did not complete|cancel/i.test(error instanceof Error ? error.message : String(error))) return;
    throw error;
  }
}

/** Saves the invoice as a PDF named after its number and opens the share sheet. */
export async function shareInvoicePdf(html: string, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) throw new Error('Sharing is not available on this device.');
  // The printed file has a random name in a folder the app may not move files
  // out of (Expo Go), so its contents are written again under the bill's name.
  const { uri, base64 } = await Print.printToFileAsync({ html, base64: true, ...A4 });
  if (!base64) throw new Error('The PDF could not be created.');
  const named = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(named, base64, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  await Sharing.shareAsync(named, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
}
