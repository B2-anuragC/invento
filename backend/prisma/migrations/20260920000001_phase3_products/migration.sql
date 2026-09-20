CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "unit" TEXT NOT NULL,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "minimumStock" DECIMAL(12,3) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_businessId_sku_key" ON "products"("businessId", "sku");
CREATE UNIQUE INDEX "products_businessId_barcode_key" ON "products"("businessId", "barcode");
CREATE INDEX "products_businessId_status_idx" ON "products"("businessId", "status");
CREATE INDEX "products_businessId_name_idx" ON "products"("businessId", "name");
CREATE INDEX "products_businessId_barcode_idx" ON "products"("businessId", "barcode");

ALTER TABLE "products"
ADD CONSTRAINT "products_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
