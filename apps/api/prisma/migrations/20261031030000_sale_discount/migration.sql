-- Bill-level sales discount: the sale keeps the discount total (and the
-- percentage when one was entered); each line keeps its share, which lowers
-- that line's taxable value. Existing sales have no discount.
BEGIN;

ALTER TABLE sales
  ADD COLUMN "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountPercent" DECIMAL(5,2);
ALTER TABLE sales
  ADD CONSTRAINT "sales_discountTotal_range" CHECK ("discountTotal" >= 0 AND "discountTotal" <= "subtotal"),
  ADD CONSTRAINT "sales_discountPercent_range" CHECK ("discountPercent" IS NULL OR ("discountPercent" >= 0 AND "discountPercent" <= 100));

ALTER TABLE sale_items ADD COLUMN "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD CONSTRAINT "sale_items_discountAmount_range" CHECK ("discountAmount" >= 0 AND "discountAmount" <= "lineTotal");

COMMIT;
