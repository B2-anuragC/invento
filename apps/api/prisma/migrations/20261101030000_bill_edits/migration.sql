-- Editing the items of a completed sale or purchase. Each edit raises the
-- bill's revision and keeps who edited it, when and why; editRequestId is the
-- last edit's request id, so a retried edit changes nothing. Owners and admins
-- of every existing shop get the new permissions; other roles do not.
BEGIN;

ALTER TABLE sales
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "editedByUserId" TEXT,
  ADD COLUMN "editReason" TEXT,
  ADD COLUMN "editRequestId" TEXT;
ALTER TABLE sales ADD CONSTRAINT "sales_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE sales ADD CONSTRAINT "sales_edit_complete" CHECK (
  ("revision" > 1) = ("editedAt" IS NOT NULL AND "editedByUserId" IS NOT NULL AND "editReason" IS NOT NULL AND "editRequestId" IS NOT NULL)
);

ALTER TABLE purchases
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "editedByUserId" TEXT,
  ADD COLUMN "editReason" TEXT,
  ADD COLUMN "editRequestId" TEXT;
ALTER TABLE purchases ADD CONSTRAINT "purchases_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE purchases ADD CONSTRAINT "purchases_edit_complete" CHECK (
  ("revision" > 1) = ("editedAt" IS NOT NULL AND "editedByUserId" IS NOT NULL AND "editReason" IS NOT NULL AND "editRequestId" IS NOT NULL)
);

UPDATE business_roles
SET "permissions" = "permissions" || ARRAY['sales.edit', 'purchases.edit']::TEXT[], "updatedAt" = now()
WHERE "isSystem" AND "key" IN ('OWNER', 'ADMIN') AND NOT ('sales.edit' = ANY ("permissions"));

COMMIT;
