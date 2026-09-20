-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');
ALTER TABLE "sales" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "PaymentMethod_old";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "contactName" TEXT;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "customerId" SET NOT NULL;

COMMIT;
