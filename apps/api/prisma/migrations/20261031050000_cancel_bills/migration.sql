-- Cancelling sales and purchases. A cancelled bill keeps its number and stays
-- in history with who cancelled it, when and why. Owners and admins of every
-- existing shop get the new permissions; other roles do not.
BEGIN;

ALTER TABLE sales
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "cancelReason" TEXT;
ALTER TABLE sales ADD CONSTRAINT "sales_cancellation_complete" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND "cancelReason" IS NOT NULL)
);

ALTER TABLE purchases
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "cancelReason" TEXT;
ALTER TABLE purchases ADD CONSTRAINT "purchases_cancellation_complete" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND "cancelReason" IS NOT NULL)
);

UPDATE business_roles
SET "permissions" = "permissions" || ARRAY['sales.cancel', 'purchases.cancel']::TEXT[], "updatedAt" = now()
WHERE "isSystem" AND "key" IN ('OWNER', 'ADMIN') AND NOT ('sales.cancel' = ANY ("permissions"));

COMMIT;
