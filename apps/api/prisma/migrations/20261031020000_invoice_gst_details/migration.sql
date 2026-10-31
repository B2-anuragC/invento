-- GST invoice details. Each sale keeps the seller and buyer GSTIN, place of
-- supply and tax type it was issued with, and each line keeps the product's
-- HSN code, so an issued invoice never changes when a profile is edited later.
-- Sales made before this migration keep NULL and print as they did before.
BEGIN;

ALTER TABLE products ADD COLUMN "hsnCode" TEXT;
ALTER TABLE products ADD CONSTRAINT "products_hsnCode_format" CHECK ("hsnCode" IS NULL OR "hsnCode" ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$');

ALTER TABLE sale_items ADD COLUMN "hsnCode" TEXT;
ALTER TABLE sale_items ADD CONSTRAINT "sale_items_hsnCode_format" CHECK ("hsnCode" IS NULL OR "hsnCode" ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$');

ALTER TABLE sales
  ADD COLUMN "sellerGstin" TEXT,
  ADD COLUMN "sellerStateCode" TEXT,
  ADD COLUMN "buyerGstin" TEXT,
  ADD COLUMN "placeOfSupply" TEXT,
  ADD COLUMN "taxType" TEXT;
ALTER TABLE sales
  ADD CONSTRAINT "sales_sellerGstin_format" CHECK ("sellerGstin" IS NULL OR "sellerGstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  ADD CONSTRAINT "sales_buyerGstin_format" CHECK ("buyerGstin" IS NULL OR "buyerGstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  ADD CONSTRAINT "sales_sellerStateCode_format" CHECK ("sellerStateCode" IS NULL OR "sellerStateCode" ~ '^[0-9]{2}$'),
  ADD CONSTRAINT "sales_placeOfSupply_format" CHECK ("placeOfSupply" IS NULL OR "placeOfSupply" ~ '^[0-9]{2}$'),
  ADD CONSTRAINT "sales_taxType_valid" CHECK ("taxType" IS NULL OR "taxType" IN ('INTRA_STATE', 'INTER_STATE', 'UNREGISTERED'));

COMMIT;
