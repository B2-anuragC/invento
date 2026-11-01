-- Sales returns (credit notes CN/…) and purchase returns (debit notes DN/…).
-- A return takes back part or all of some lines of a completed bill; the bill
-- itself never changes, except that it keeps the running total returned so
-- its net amount and what is still owed follow. Each series is numbered per
-- financial year through document_counters. Owners and admins of every
-- existing shop get the new permissions; other roles do not.
BEGIN;

ALTER TABLE document_counters DROP CONSTRAINT "document_counters_series_check";
ALTER TABLE document_counters ADD CONSTRAINT "document_counters_series_check" CHECK ("series" IN ('SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'));

-- What has been returned so far; the amount paid can never exceed the net total.
ALTER TABLE sales ADD COLUMN "returnedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD CONSTRAINT "sales_returned_bounds" CHECK ("returnedTotal" >= 0 AND "returnedTotal" <= total);
ALTER TABLE sales DROP CONSTRAINT "sales_paid_bounds";
ALTER TABLE sales ADD CONSTRAINT "sales_paid_bounds" CHECK ("amountPaid" IS NULL OR ("amountPaid" >= 0 AND "amountPaid" <= total - "returnedTotal"));

ALTER TABLE purchases ADD COLUMN "returnedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD CONSTRAINT "purchases_returned_bounds" CHECK ("returnedTotal" >= 0 AND "returnedTotal" <= total);
ALTER TABLE purchases DROP CONSTRAINT "purchases_paid_bounds";
ALTER TABLE purchases ADD CONSTRAINT "purchases_paid_bounds" CHECK ("amountPaid" IS NULL OR ("amountPaid" >= 0 AND "amountPaid" <= total - "returnedTotal"));

-- The stock each sale line took, as stored in the ledger (pieces for grouped
-- products), so a return puts back exactly its share. Filled for existing
-- lines from the sale's ledger rows, or from the line when it was sold
-- without a selling option; a line that stays empty cannot be returned.
ALTER TABLE sale_items ADD COLUMN "stockQuantity" DECIMAL(18,3);
ALTER TABLE sale_items ADD CONSTRAINT "sale_items_stock_quantity_positive" CHECK ("stockQuantity" IS NULL OR "stockQuantity" > 0);

UPDATE sale_items i SET "stockQuantity" = NULLIF((
    SELECT -SUM(t.quantity) FROM inventory_transactions t JOIN sales s ON s.id = i."saleId"
    WHERE t."businessId" = s."businessId" AND t."productId" = i."productId" AND t.type = 'SALE' AND t.note = 'Sale ' || i."saleId"
  ), 0)
WHERE (SELECT COUNT(*) FROM sale_items o WHERE o."saleId" = i."saleId" AND o."productId" = i."productId") = 1;

UPDATE sale_items i SET "stockQuantity" = CASE
    WHEN i.unit = 'PIECE' AND p."piecesPerUnit" IS NOT NULL THEN i.quantity * i."unitsPerOption"
    ELSE i.quantity * i."unitsPerOption" * COALESCE(p."piecesPerUnit", 1) END
FROM products p
WHERE p.id = i."productId" AND i."stockQuantity" IS NULL AND i."sellingOptionId" IS NULL;

UPDATE sale_items i SET "stockQuantity" = NULLIF(GREATEST((
    SELECT -SUM(t.quantity) FROM inventory_transactions t JOIN sales s ON s.id = i."saleId"
    WHERE t."businessId" = s."businessId" AND t."productId" = i."productId" AND t.type = 'SALE' AND t.note = 'Sale ' || i."saleId"
  ) - (SELECT COALESCE(SUM(o."stockQuantity"), 0) FROM sale_items o WHERE o."saleId" = i."saleId" AND o."productId" = i."productId" AND o.id <> i.id), 0), 0)
WHERE i."stockQuantity" IS NULL
  AND (SELECT COUNT(*) FROM sale_items o WHERE o."saleId" = i."saleId" AND o."productId" = i."productId" AND o."stockQuantity" IS NULL) = 1;

CREATE TABLE "sale_returns" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "documentSeq" INTEGER NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refundMethod" "PaymentMethod",
  "reason" TEXT,
  "requestId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_returns_amounts" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "discountTotal" <= "subtotal" AND "taxTotal" >= 0 AND "total" = "subtotal" - "discountTotal" + "taxTotal"),
  CONSTRAINT "sale_returns_refund" CHECK ("refundAmount" >= 0 AND "refundAmount" <= "total" AND ("refundAmount" > 0) = ("refundMethod" IS NOT NULL)),
  CONSTRAINT "sale_returns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sale_returns_businessId_requestId_key" ON "sale_returns"("businessId", "requestId");
CREATE UNIQUE INDEX "sale_returns_businessId_financialYear_documentSeq_key" ON "sale_returns"("businessId", "financialYear", "documentSeq");
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");

CREATE TABLE "sale_return_items" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "stockQuantity" DECIMAL(18,3) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_return_items_amounts" CHECK ("quantity" > 0 AND "stockQuantity" > 0 AND "lineTotal" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "lineTotal" AND "taxAmount" >= 0),
  CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sale_return_items_returnId_saleItemId_key" ON "sale_return_items"("returnId", "saleItemId");
CREATE INDEX "sale_return_items_saleItemId_idx" ON "sale_return_items"("saleItemId");

CREATE TABLE "purchase_returns" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "documentSeq" INTEGER NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refundMethod" "PaymentMethod",
  "reason" TEXT,
  "requestId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_returns_amounts" CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "total" = "subtotal" + "taxTotal"),
  CONSTRAINT "purchase_returns_refund" CHECK ("refundAmount" >= 0 AND "refundAmount" <= "total" AND ("refundAmount" > 0) = ("refundMethod" IS NOT NULL)),
  CONSTRAINT "purchase_returns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_returns_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_returns_businessId_requestId_key" ON "purchase_returns"("businessId", "requestId");
CREATE UNIQUE INDEX "purchase_returns_businessId_financialYear_documentSeq_key" ON "purchase_returns"("businessId", "financialYear", "documentSeq");
CREATE INDEX "purchase_returns_purchaseId_idx" ON "purchase_returns"("purchaseId");

CREATE TABLE "purchase_return_items" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "purchaseItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_return_items_amounts" CHECK ("quantity" > 0 AND "lineTotal" >= 0 AND "taxAmount" >= 0),
  CONSTRAINT "purchase_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_return_items_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_return_items_returnId_purchaseItemId_key" ON "purchase_return_items"("returnId", "purchaseItemId");
CREATE INDEX "purchase_return_items_purchaseItemId_idx" ON "purchase_return_items"("purchaseItemId");

UPDATE business_roles
SET "permissions" = "permissions" || ARRAY['sales.return', 'purchases.return']::TEXT[], "updatedAt" = now()
WHERE "isSystem" AND "key" IN ('OWNER', 'ADMIN') AND NOT ('sales.return' = ANY ("permissions"));

COMMIT;
