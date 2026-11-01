import { BadRequestException } from '@nestjs/common';
import { DEFAULT_DOCUMENT_PREFIX, financialYearOf, formatDocumentNumber, type DocumentSeries } from '@invento/shared';
import { Prisma } from '@prisma/client';

export type AllocatedDocumentNumber = { documentNumber: string; financialYear: string; documentSeq: number };

// A device clock a little ahead of the server is tolerated; more than this is
// rejected, because the bill date decides the invoice's financial year.
const FUTURE_DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function assertNotFutureDated(date: Date, label: 'Sale' | 'Purchase' | 'Payment', now = Date.now()): void {
  if (date.getTime() > now + FUTURE_DATE_TOLERANCE_MS) {
    throw new BadRequestException(`${label} date is in the future. Check the device date and time.`);
  }
}

/**
 * Keeps a numbered bill in its invoice's financial year: the number's year
 * segment must keep matching the bill date.
 */
export function assertSameFinancialYear(record: { documentNumber: string | null; financialYear: string | null }, date: Date): void {
  if (record.financialYear && financialYearOf(date) !== record.financialYear) {
    throw new BadRequestException(`Invoice ${record.documentNumber} belongs to financial year ${record.financialYear}; its date must stay within that year.`);
  }
}

/**
 * Issues the next number in the business's series for the bill date's financial
 * year. Call inside the bill's transaction: the counter row stays locked until
 * commit and rolls back with the bill, so numbers are consecutive with no gaps.
 */
export async function allocateDocumentNumber(tx: Prisma.TransactionClient, businessId: string, series: DocumentSeries, documentDate: Date): Promise<AllocatedDocumentNumber> {
  const financialYear = financialYearOf(documentDate);
  const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { invoicePrefix: true, purchasePrefix: true } });
  const [counter] = await tx.$queryRaw<{ lastNumber: number }[]>(
    Prisma.sql`INSERT INTO "document_counters" ("businessId", "series", "financialYear", "lastNumber")
      VALUES (${businessId}, ${series}, ${financialYear}, 1)
      ON CONFLICT ("businessId", "series", "financialYear")
      DO UPDATE SET "lastNumber" = "document_counters"."lastNumber" + 1
      RETURNING "lastNumber"`,
  );
  const documentSeq = Number(counter.lastNumber);
  // Credit and debit notes always use CN and DN.
  const prefix = series === 'SALE' ? business.invoicePrefix : series === 'PURCHASE' ? business.purchasePrefix : DEFAULT_DOCUMENT_PREFIX[series];
  return { financialYear, documentSeq, documentNumber: formatDocumentNumber(prefix, financialYear, documentSeq) };
}
