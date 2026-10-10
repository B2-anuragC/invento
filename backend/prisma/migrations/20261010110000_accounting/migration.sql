BEGIN;
ALTER TABLE products ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK ("gstRate" BETWEEN 0 AND 100);
ALTER TABLE sales ADD COLUMN subtotal DECIMAL(14,2), ADD COLUMN "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN "amountPaid" DECIMAL(14,2), ADD COLUMN "dueDate" DATE, ADD COLUMN "requestId" TEXT;
UPDATE sales SET subtotal = total;
ALTER TABLE sales ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE sales ADD CONSTRAINT "sales_paid_bounds" CHECK ("amountPaid" IS NULL OR ("amountPaid" >= 0 AND "amountPaid" <= total));
CREATE UNIQUE INDEX "sales_businessId_requestId_key" ON sales("businessId", "requestId");
ALTER TABLE purchases ADD COLUMN subtotal DECIMAL(14,2), ADD COLUMN "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN "amountPaid" DECIMAL(14,2), ADD COLUMN "dueDate" DATE, ADD COLUMN "requestId" TEXT;
UPDATE purchases SET subtotal = total;
ALTER TABLE purchases ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE purchases ADD CONSTRAINT "purchases_paid_bounds" CHECK ("amountPaid" IS NULL OR ("amountPaid" >= 0 AND "amountPaid" <= total));
CREATE UNIQUE INDEX "purchases_businessId_requestId_key" ON purchases("businessId", "requestId");
ALTER TABLE sale_items ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0, ADD COLUMN "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0, ADD COLUMN "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
CREATE TABLE transaction_payments (
 id TEXT PRIMARY KEY, "businessId" TEXT NOT NULL REFERENCES businesses(id), "saleId" TEXT REFERENCES sales(id) ON DELETE RESTRICT, "purchaseId" TEXT REFERENCES purchases(id) ON DELETE RESTRICT,
 "requestId" TEXT NOT NULL, amount DECIMAL(14,2) NOT NULL CHECK (amount > 0), method "PaymentMethod" NOT NULL, kind TEXT NOT NULL DEFAULT 'PAYMENT', "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT NOT NULL REFERENCES users(id),
 CONSTRAINT payment_one_transaction CHECK (("saleId" IS NOT NULL)::int + ("purchaseId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "transaction_payments_businessId_requestId_key" ON transaction_payments("businessId", "requestId");
CREATE INDEX "transaction_payments_saleId_idx" ON transaction_payments("saleId");
CREATE INDEX "transaction_payments_purchaseId_idx" ON transaction_payments("purchaseId");
COMMIT;
