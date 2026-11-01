-- Optional GST per bill. Each sale and purchase records whether it charged GST;
-- a bill that does not has no tax on any line. Existing bills charged GST at
-- their products' rates, so they keep true.
BEGIN;

ALTER TABLE sales ADD COLUMN "chargeGst" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sales ADD CONSTRAINT "sales_no_gst_no_tax" CHECK ("chargeGst" OR "taxTotal" = 0);

ALTER TABLE purchases ADD COLUMN "chargeGst" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE purchases ADD CONSTRAINT "purchases_no_gst_no_tax" CHECK ("chargeGst" OR "taxTotal" = 0);

COMMIT;
