-- Sequential invoice numbers per business, series and Indian financial year
-- (CGST Rule 46(b): at most 16 characters, unique for a financial year).
-- Existing bills stay unnumbered; only new bills receive numbers.
BEGIN;

ALTER TABLE businesses
  ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN "purchasePrefix" TEXT NOT NULL DEFAULT 'PUR';
ALTER TABLE businesses
  ADD CONSTRAINT "businesses_invoicePrefix_format" CHECK ("invoicePrefix" ~ '^[A-Z0-9]{1,3}$'),
  ADD CONSTRAINT "businesses_purchasePrefix_format" CHECK ("purchasePrefix" ~ '^[A-Z0-9]{1,3}$');

CREATE TABLE "document_counters" (
  "businessId" TEXT NOT NULL,
  "series" TEXT NOT NULL CHECK ("series" IN ('SALE', 'PURCHASE')),
  "financialYear" TEXT NOT NULL CHECK ("financialYear" ~ '^[0-9]{4}-[0-9]{2}$'),
  "lastNumber" INTEGER NOT NULL CHECK ("lastNumber" >= 1),
  CONSTRAINT "document_counters_pkey" PRIMARY KEY ("businessId", "series", "financialYear"),
  CONSTRAINT "document_counters_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE sales
  ADD COLUMN "documentNumber" TEXT,
  ADD COLUMN "financialYear" TEXT,
  ADD COLUMN "documentSeq" INTEGER;
ALTER TABLE sales ADD CONSTRAINT "sales_document_number_complete" CHECK (
  ("documentNumber" IS NULL) = ("financialYear" IS NULL) AND ("documentNumber" IS NULL) = ("documentSeq" IS NULL)
);
CREATE UNIQUE INDEX "sales_businessId_financialYear_documentSeq_key" ON sales("businessId", "financialYear", "documentSeq");
CREATE INDEX "sales_businessId_documentNumber_idx" ON sales("businessId", "documentNumber");

ALTER TABLE purchases
  ADD COLUMN "documentNumber" TEXT,
  ADD COLUMN "financialYear" TEXT,
  ADD COLUMN "documentSeq" INTEGER;
ALTER TABLE purchases ADD CONSTRAINT "purchases_document_number_complete" CHECK (
  ("documentNumber" IS NULL) = ("financialYear" IS NULL) AND ("documentNumber" IS NULL) = ("documentSeq" IS NULL)
);
CREATE UNIQUE INDEX "purchases_businessId_financialYear_documentSeq_key" ON purchases("businessId", "financialYear", "documentSeq");
CREATE INDEX "purchases_businessId_documentNumber_idx" ON purchases("businessId", "documentNumber");

COMMIT;
