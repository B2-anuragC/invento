-- GST profile: shop GSTIN and state, customer and supplier GSTIN.
-- Full validation (state code list and check character) happens in the API;
-- these checks only keep malformed values out of the database.
BEGIN;

ALTER TABLE businesses
  ADD COLUMN "gstin" TEXT,
  ADD COLUMN "stateCode" TEXT;
ALTER TABLE businesses
  ADD CONSTRAINT "businesses_gstin_format" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  ADD CONSTRAINT "businesses_stateCode_format" CHECK ("stateCode" IS NULL OR "stateCode" ~ '^[0-9]{2}$');

ALTER TABLE customers ADD COLUMN "gstin" TEXT;
ALTER TABLE customers ADD CONSTRAINT "customers_gstin_format" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');

ALTER TABLE suppliers ADD COLUMN "gstin" TEXT;
ALTER TABLE suppliers ADD CONSTRAINT "suppliers_gstin_format" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');

COMMIT;
