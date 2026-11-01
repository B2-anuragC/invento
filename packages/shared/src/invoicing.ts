// Invoice numbering under CGST Rule 46(b): a consecutive serial number of at most
// 16 characters (letters, digits, "-" and "/"), unique for a financial year.

// Credit notes (sales returns) and debit notes (purchase returns) have their own series.
export const DOCUMENT_SERIES = ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const;
export type DocumentSeries = (typeof DOCUMENT_SERIES)[number];

export const DEFAULT_DOCUMENT_PREFIX: Record<DocumentSeries, string> = { SALE: 'INV', PURCHASE: 'PUR', CREDIT_NOTE: 'CN', DEBIT_NOTE: 'DN' };
export const MAX_DOCUMENT_NUMBER_LENGTH = 16;
export const DOCUMENT_PREFIX_RULE_MESSAGE = 'Use 1 to 3 letters or digits for the invoice prefix.';

// India has no daylight saving, so a fixed offset is exact.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Indian financial year (1 April – 31 March, Asia/Kolkata) containing the date, e.g. "2026-27". */
export function financialYearOf(value: Date | string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new RangeError('Invalid date for financial year.');
  const ist = new Date(time + IST_OFFSET_MS);
  const startYear = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function normalizeDocumentPrefix(value: string): string {
  return value.trim().toUpperCase();
}

/** Prefixes are kept short so the full number fits in 16 characters. */
export function isValidDocumentPrefix(value: string): boolean {
  return /^[A-Z0-9]{1,3}$/.test(value);
}

/**
 * "INV/2026-27/0001". From 10,000 bills in a year the year is shortened
 * ("INV/26-27/10000") so the number stays within 16 characters.
 */
export function formatDocumentNumber(prefix: string, financialYear: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new RangeError('Invoice sequence must be a positive whole number.');
  const serial = String(sequence).padStart(4, '0');
  const full = `${prefix}/${financialYear}/${serial}`;
  if (full.length <= MAX_DOCUMENT_NUMBER_LENGTH) return full;
  const short = `${prefix}/${financialYear.slice(2)}/${serial}`;
  if (short.length <= MAX_DOCUMENT_NUMBER_LENGTH) return short;
  throw new RangeError('Invoice number would exceed 16 characters.');
}
