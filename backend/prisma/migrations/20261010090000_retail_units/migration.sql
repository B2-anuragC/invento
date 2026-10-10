BEGIN;
ALTER TABLE "products" ADD COLUMN "piecesPerUnit" INTEGER;
ALTER TABLE "sale_items" ADD COLUMN "unit" TEXT;
-- Existing dozen stock is converted to whole pieces, with ledger balances matching.
UPDATE "products" SET "piecesPerUnit" = 12 WHERE unit = 'DOZEN';
ALTER TABLE "inventories" ALTER COLUMN quantity TYPE DECIMAL(18,3);
ALTER TABLE "inventory_transactions" ALTER COLUMN quantity TYPE DECIMAL(18,3);
ALTER TABLE "inventory_transactions" ALTER COLUMN "balanceAfter" TYPE DECIMAL(18,3);
UPDATE "inventories" i SET quantity = i.quantity * 12 FROM "products" p WHERE i."productId" = p.id AND p.unit = 'DOZEN';
UPDATE "inventory_transactions" i SET quantity = i.quantity * 12, "balanceAfter" = i."balanceAfter" * 12 FROM "products" p WHERE i."productId" = p.id AND p.unit = 'DOZEN';
ALTER TABLE "products" ADD CONSTRAINT "products_pieces_per_unit_check" CHECK ("piecesPerUnit" IS NULL OR ("piecesPerUnit" BETWEEN 1 AND 100000 AND unit IN ('BOX', 'PACK', 'DOZEN')));
COMMIT;
