-- Built-in walk-in customer: one per shop, used for counter sales when no
-- customer is chosen. "isWalkIn" is TRUE only on that row and NULL on every
-- other customer, so the unique index allows exactly one per business.
BEGIN;

ALTER TABLE customers ADD COLUMN "isWalkIn" BOOLEAN;
ALTER TABLE customers ADD CONSTRAINT "customers_isWalkIn_true_or_null" CHECK ("isWalkIn" IS NULL OR "isWalkIn");
CREATE UNIQUE INDEX "customers_businessId_isWalkIn_key" ON customers ("businessId", "isWalkIn");

INSERT INTO customers ("id", "businessId", "name", "isWalkIn", "status", "revision", "createdAt", "updatedAt")
SELECT 'walkin_' || b.id, b.id, 'Walk-in customer', TRUE, 'ACTIVE', 1, now(), now()
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c."businessId" = b.id AND c."isWalkIn");

COMMIT;
