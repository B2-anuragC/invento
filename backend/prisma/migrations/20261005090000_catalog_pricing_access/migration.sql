ALTER TABLE "products" ADD COLUMN "category" TEXT;

ALTER TABLE "businesses"
ADD COLUMN "membersCanViewPurchasePrice" BOOLEAN NOT NULL DEFAULT true;
