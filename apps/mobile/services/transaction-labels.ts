// How a sale or purchase is named across lists, details and receipts.
// New bills carry a system invoice number (documentNumber). Bills saved before
// numbering keep their typed sale reference or a short id, as they always had.

type Kind = 'sale' | 'purchase';
type Labelled = { id: string; documentNumber?: string | null; invoiceNumber?: string | null; syncState?: string };

const kindName = (kind: Kind) => (kind === 'sale' ? 'Sale' : 'Purchase');

export function shortReference(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** Main heading for a bill: "INV/2026-27/0001", or "Sale CR64IRW9" for older bills. */
export function transactionTitle(kind: Kind, record: Labelled): string {
  if (record.documentNumber) return record.documentNumber;
  if (kind === 'sale' && record.invoiceNumber) return record.invoiceNumber;
  return `${kindName(kind)} ${shortReference(record.id)}`;
}

/** Number only, for compact rows: "INV/2026-27/0001" or "CR64IRW9". */
export function transactionNumber(kind: Kind, record: Labelled): string {
  if (record.documentNumber) return record.documentNumber;
  if (kind === 'sale' && record.invoiceNumber) return record.invoiceNumber;
  return shortReference(record.id);
}

/**
 * Second line under the number: the typed sale reference, or the supplier's
 * own invoice number for purchases. Empty when there is nothing extra to show.
 */
export function transactionReference(kind: Kind, record: Labelled): string {
  if (!record.invoiceNumber) return '';
  if (kind === 'purchase') return `Supplier invoice ${record.invoiceNumber}`;
  return record.documentNumber ? `Reference ${record.invoiceNumber}` : '';
}

/** Text a search box matches: names plus every number a user may type. */
export function transactionSearchText(record: Labelled & { name?: string }): string {
  return [record.name, record.documentNumber, record.invoiceNumber, record.id].filter(Boolean).join(' ').toLowerCase();
}

export type ReceiptIdentity = { caption: string; value: string; note?: string };

/** Identity block at the top of a receipt. */
export function receiptIdentity(kind: Kind, record: Labelled): ReceiptIdentity {
  if (record.syncState) {
    return {
      caption: 'PROVISIONAL DEVICE REFERENCE',
      value: `Device bill · ${shortReference(record.id)}`,
      note: `The ${kind === 'sale' ? 'invoice' : 'purchase'} number is assigned when this bill syncs.`,
    };
  }
  const reference = transactionReference(kind, record);
  if (record.documentNumber) {
    return { caption: kind === 'sale' ? 'INVOICE NUMBER' : 'PURCHASE NUMBER', value: record.documentNumber, ...(reference ? { note: reference } : {}) };
  }
  // Saved before invoice numbering.
  return kind === 'sale'
    ? { caption: 'INVOICE / TRANSACTION IDENTIFIER', value: record.invoiceNumber || record.id }
    : { caption: 'INTERNAL PURCHASE IDENTIFIER', value: record.id, ...(reference ? { note: reference } : {}) };
}
