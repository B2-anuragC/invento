import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@invento/shared';

describe.runIf(process.env.RUN_AUTHORIZATION_DATABASE_TESTS === '1')(
  'Authorization additive migration',
  () => {
    it('preserves legacy membership assignments and states, scopes roles, and retains legacy price access', async () => {
      const db = new PrismaClient();
      const schema = `migration_check_${randomUUID().replaceAll('-', '')}`;
      const migration = readFileSync(
        new URL(
          '../prisma/migrations/20261025000000_business_permissions/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      try {
        await expect(
          db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe(
              'CREATE TABLE businesses (id TEXT PRIMARY KEY, "membersCanViewPurchasePrice" BOOLEAN NOT NULL)',
            );
            await tx.$executeRawUnsafe(
              'CREATE TABLE business_users (id TEXT PRIMARY KEY, "businessId" TEXT NOT NULL, "userId" TEXT NOT NULL, role TEXT NOT NULL, "isActive" BOOLEAN NOT NULL)',
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO businesses VALUES ('a',true),('b',false)",
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO business_users VALUES ('owner','a','one','OWNER',true),('admin','a','two','ADMIN',true),('staff','a','three','MEMBER',false),('private','b','three','MEMBER',true),('unknown','b','four','OLD_CUSTOM',true)",
            );
            const before = await tx.$queryRawUnsafe(
              'SELECT * FROM business_users ORDER BY id',
            );
            for (const statement of migration
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean))
              await tx.$executeRawUnsafe(statement);
            expect(
              await tx.$queryRawUnsafe(
                'SELECT * FROM business_users ORDER BY id',
              ),
            ).toEqual(before);
            const roles = await tx.$queryRawUnsafe<
              { businessId: string; key: string; permissions: string[] }[]
            >('SELECT "businessId", key, permissions FROM business_roles');
            expect(
              roles.find((r) => r.businessId === 'a' && r.key === 'OWNER')
                ?.permissions,
            ).toEqual([...PERMISSIONS]);
            expect(
              roles.find((r) => r.businessId === 'a' && r.key === 'MEMBER')
                ?.permissions,
            ).toContain('pricing.view');
            expect(
              roles.find((r) => r.businessId === 'b' && r.key === 'MEMBER')
                ?.permissions,
            ).not.toContain('pricing.view');
            expect(
              roles.find((r) => r.key === 'OLD_CUSTOM')?.permissions,
            ).toContain('products.view');
            expect(
              roles.find((r) => r.key === 'OLD_CUSTOM')?.permissions,
            ).not.toContain('products.create');
            await tx.$executeRawUnsafe(
              "INSERT INTO business_roles (\"businessId\",key,name,permissions) VALUES ('b','ONLY_B','Only B',ARRAY[]::TEXT[])",
            );
            await tx.$executeRawUnsafe('SAVEPOINT foreign_role');
            await expect(
              tx.$executeRawUnsafe(
                "UPDATE business_users SET role='ONLY_B' WHERE id='staff'",
              ),
            ).rejects.toThrow();
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT foreign_role');
            throw new Error('SUCCESS_ROLLBACK_TEST_SCHEMA');
          }),
        ).rejects.toThrow('SUCCESS_ROLLBACK_TEST_SCHEMA');
      } finally {
        await db.$disconnect();
      }
    });
  },
);
