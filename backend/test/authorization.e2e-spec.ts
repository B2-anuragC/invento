import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AccessTokenGuard } from '../src/auth/auth.guard.js';
import { AccessManagementController } from '../src/access/access.controller.js';
import { AccessManagementService } from '../src/access/access.service.js';
import {
  BusinessPermissionGuard,
  BusinessAccessInterceptor,
} from '../src/access/business-permission.guard.js';
import { BusinessesController } from '../src/businesses/businesses.controller.js';
import { BusinessesService } from '../src/businesses/businesses.service.js';
import { ProductsController } from '../src/products/products.controller.js';
import { ProductsService } from '../src/products/products.service.js';
import { InventoryController } from '../src/inventory/inventory.controller.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { SyncController } from '../src/sync/sync.controller.js';
import { SyncService } from '../src/sync/sync.service.js';
import { FilesService } from '../src/files/files.service.js';
import { PlatformAdminController } from '../src/platform-admin/platform-admin.controller.js';
import { PlatformAdminService } from '../src/platform-admin/platform-admin.service.js';
import { PlatformAdminGuard } from '../src/platform-admin/platform-admin.guard.js';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';

describe.runIf(process.env.RUN_AUTHORIZATION_DATABASE_TESTS === '1')(
  'Authorization with PostgreSQL and existing JWT sessions',
  () => {
    let app: INestApplication;
    let db: PrismaService;
    type Account = { id: string; token: string; email: string };
    let owner: Account;
    let viewer: Account;
    let delegated: Account;
    let operator: Account;
    let shop: string;
    let otherShop: string;
    let product: string;
    const accounts: string[] = [];
    const shops: string[] = [];
    const password = 'Authorization-test-password-123!';
    const call = (
      method: 'get' | 'post' | 'patch' | 'delete',
      path: string,
      actor: Account = owner,
      businessId = shop,
    ) =>
      request(app.getHttpServer())
        [method](`/api${path}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .set('X-Business-Id', businessId || '');
    const base = () => `/businesses/${shop}/access`;
    const reason = {
      reason: 'Authorization integration test',
      confirmed: true,
    };
    async function account(): Promise<Account> {
      const email = `${randomUUID()}@authorization.test`;
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, name: 'Authorization test' })
        .expect(201);
      accounts.push(res.body.data.user.id);
      return {
        id: res.body.data.user.id,
        token: res.body.data.accessToken,
        email,
      };
    }
    async function business(actor: Account = owner) {
      const res = await call('post', '/businesses', actor)
        .send({ name: 'Authorization shop', slug: randomUUID() })
        .expect(201);
      shops.push(res.body.data.id);
      return res.body.data.id as string;
    }
    const productInput = {
      name: 'Private cost',
      sku: 'AUTHZ',
      unit: 'KG',
      purchasePrice: '17.50',
      sellingPrice: '25',
      minimumStock: '0',
    };
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ],
        controllers: [
          AuthController,
          AccessManagementController,
          BusinessesController,
          ProductsController,
          InventoryController,
          SyncController,
          PlatformAdminController,
        ],
        providers: [
          PrismaService,
          AuthService,
          AccessTokenGuard,
          AccessManagementService,
          BusinessPermissionGuard,
          BusinessAccessInterceptor,
          BusinessesService,
          ProductsService,
          InventoryService,
          SyncService,
          PlatformAdminGuard,
          PlatformAdminService,
          { provide: FilesService, useValue: {} },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(globalValidationPipe);
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalInterceptors(new ResponseInterceptor());
      await app.listen(0, '127.0.0.1');
      db = app.get(PrismaService);
      await db.$connect();
      owner = await account();
      viewer = await account();
      delegated = await account();
      operator = await account();
      await db.user.update({
        where: { id: operator.id },
        data: { isPlatformAdmin: true },
      });
      shop = await business();
      otherShop = await business();
      await call('post', `${base()}/members`)
        .send({ email: viewer.email, role: 'VIEWER' })
        .expect(201);
      await call('post', `${base()}/members`)
        .send({ email: delegated.email, role: 'ADMIN' })
        .expect(201);
      product = (await call('post', '/products').send(productInput).expect(201))
        .body.data.id;
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      if (db) {
        await db.platformAuditLog.deleteMany({
          where: {
            OR: [{ businessId: { in: shops } }, { actorId: { in: accounts } }],
          },
        });
        await db.business.deleteMany({ where: { id: { in: shops } } });
        await db.user.deleteMany({ where: { id: { in: accounts } } });
        await db.$disconnect();
      }
      await app?.close();
    });
    it('uses one identity, seeds roles, and denies missing authentication and viewer writes', async () => {
      await request(app.getHttpServer()).get(`/api${base()}/me`).expect(401);
      const me = (await call('get', `${base()}/me`, viewer).expect(200)).body
        .data;
      expect(me.permissions).toContain('products.view');
      expect(me.permissions).not.toContain('products.create');
      expect(
        (await call('get', `${base()}/roles`).expect(200)).body.data.map(
          (r: { key: string }) => r.key,
        ),
      ).toEqual(
        expect.arrayContaining([
          'OWNER',
          'ADMIN',
          'MANAGER',
          'SALESPERSON',
          'VIEWER',
          'MEMBER',
        ]),
      );
      await call('get', '/products', viewer).expect(200);
      await call('post', '/products', viewer)
        .send({ ...productInput, sku: 'DENIED' })
        .expect(403);
      await call('get', '/platform-admin/users', viewer).expect(403);
      await call('patch', '/auth/me', viewer)
        .send({ name: 'Escalate', isPlatformAdmin: true })
        .expect(422);
    });
    it('changes permissions on the same already-issued access token', async () => {
      await call('post', `${base()}/roles`)
        .send({
          key: 'CUSTOM_READER',
          name: 'Custom reader',
          permissions: ['business.view', 'products.view'],
        })
        .expect(201);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'CUSTOM_READER' })
        .expect(200);
      await call('get', '/products', viewer).expect(200);
      await call('patch', `${base()}/roles/CUSTOM_READER`)
        .send({ permissions: [] })
        .expect(200);
      await call('get', '/products', viewer).expect(403);
      expect(
        (await call('get', `${base()}/me`, viewer).expect(200)).body.data
          .permissions,
      ).toEqual([]);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'VIEWER' })
        .expect(200);
    });
    it('deactivates only the selected business membership and supports reactivation', async () => {
      await call(
        'post',
        `/businesses/${otherShop}/access/members`,
        owner,
        otherShop,
      )
        .send({ email: viewer.email, role: 'VIEWER' })
        .expect(201);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ isActive: false })
        .expect(200);
      await call('get', '/products', viewer).expect(403);
      await call('get', '/products', viewer, otherShop).expect(200);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ isActive: true })
        .expect(200);
      await call('get', '/products', viewer).expect(200);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ isActive: 'false' })
        .expect(422);
    });
    it('rejects self escalation, broader grants, owner assignment, and foreign roles', async () => {
      const permissions = [
        'business.view',
        'roles.view',
        'roles.manage',
        'members.view',
        'members.invite',
        'members.update',
        'members.remove',
        'products.view',
      ];
      await call('post', `${base()}/roles`)
        .send({ key: 'DELEGATED', name: 'Delegated', permissions })
        .expect(201);
      await call('patch', `${base()}/members/${delegated.id}`)
        .send({ role: 'DELEGATED' })
        .expect(200);
      await call('post', `${base()}/roles`, delegated)
        .send({
          key: 'TOO_POWERFUL',
          name: 'Too powerful',
          permissions: ['products.delete'],
        })
        .expect(403);
      await call('patch', `${base()}/roles/DELEGATED`, delegated)
        .send({ permissions })
        .expect(403);
      await call('patch', `${base()}/roles/ADMIN`, delegated)
        .send({ permissions: [] })
        .expect(403);
      await call('patch', `${base()}/members/${delegated.id}`, delegated)
        .send({ role: 'OWNER' })
        .expect(403);
      await call('patch', `${base()}/members/${viewer.id}`, delegated)
        .send({ role: 'OWNER' })
        .expect(403);
      await call(
        'post',
        `/businesses/${otherShop}/access/roles`,
        owner,
        otherShop,
      )
        .send({ key: 'FOREIGN_ONLY', name: 'Foreign only', permissions: [] })
        .expect(201);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'FOREIGN_ONLY' })
        .expect(404);
      await call('post', `${base()}/roles`)
        .send({
          key: 'UNKNOWN',
          name: 'Unknown',
          permissions: ['platform.root'],
        })
        .expect(422);
      await call('patch', `${base()}/roles/OWNER`)
        .send({ permissions: [] })
        .expect(403);
      await call('delete', `${base()}/roles/VIEWER`).expect(400);
    });
    it('protects prices and requires delete permission for status changes via PATCH', async () => {
      await call('post', `${base()}/roles`)
        .send({
          key: 'EDITOR',
          name: 'Product editor',
          permissions: ['business.view', 'products.view', 'products.update'],
        })
        .expect(201);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'EDITOR' })
        .expect(200);
      const updated = await call('patch', `/products/${product}`, viewer)
        .send({ name: 'Edited without cost authority' })
        .expect(200);
      expect(updated.body.data).not.toHaveProperty('purchasePrice');
      await call('patch', `/products/${product}`, viewer)
        .send({ status: 'INACTIVE' })
        .expect(403);
      await call('delete', `/products/${product}`, viewer).expect(403);
      const foreign = (
        await call('post', '/products', owner, otherShop)
          .send(productInput)
          .expect(201)
      ).body.data.id;
      await call('get', `/products/${foreign}`, viewer).expect(404);
      await call('patch', `/products/${foreign}`, viewer)
        .send({ name: 'Foreign update' })
        .expect(404);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'VIEWER' })
        .expect(200);
    });
    it('authorizes direct platform business management and fails closed if the audit cannot persist', async () => {
      await call('get', '/products', operator).expect(403);
      await call('get', '/products', operator)
        .set('X-Platform-Access', 'business-management')
        .expect(200);
      await call('get', '/products', viewer)
        .set('X-Platform-Access', 'business-management')
        .expect(403);
      await call('get', '/products', operator)
        .set('X-Platform-Access', 'unknown-mode')
        .expect(400);
      expect(
        await db.platformAuditLog.count({
          where: {
            businessId: shop,
            actorId: operator.id,
            action: 'BUSINESS_SUPPORT_ACCESS',
            reason: 'Platform business management',
          },
        }),
      ).toBeGreaterThan(0);
      await call('get', '/products', operator)
        .set('X-Platform-Access-Reason', 'Customer support case 123')
        .expect(200);
      expect(
        await db.platformAuditLog.count({
          where: {
            businessId: shop,
            actorId: operator.id,
            action: 'BUSINESS_SUPPORT_ACCESS',
          },
        }),
      ).toBeGreaterThan(0);
      const spy = vi
        .spyOn(db.platformAuditLog, 'create')
        .mockRejectedValueOnce(new Error('Audit unavailable'));
      try {
        await call('get', '/products', operator)
          .set('X-Platform-Access', 'business-management')
          .expect(500);
      } finally {
        spy.mockRestore();
      }
      expect(
        await db.businessUser.findUnique({
          where: {
            businessId_userId: { businessId: shop, userId: operator.id },
          },
        }),
      ).toBeNull();
    });
    it('filters sync snapshots and rejects replay after write authority is absent', async () => {
      await call('post', `${base()}/roles`)
        .send({
          key: 'ONLY_PRODUCTS',
          name: 'Products only',
          permissions: ['products.view'],
        })
        .expect(201);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'ONLY_PRODUCTS' })
        .expect(200);
      const snapshot = (await call('get', '/sync/snapshot', viewer).expect(200))
        .body.data;
      expect(snapshot.products).toHaveLength(1);
      expect(snapshot.products[0]).not.toHaveProperty('purchasePrice');
      for (const name of [
        'sales',
        'purchases',
        'customers',
        'suppliers',
        'inventory',
        'inventoryActivity',
      ])
        expect(snapshot[name]).toEqual([]);
      await call('post', '/sync/push', viewer)
        .send({
          entity: 'products',
          entityId: product,
          operationId: randomUUID(),
          action: 'update',
          baseRevision: 1,
          payload: { name: 'Replay denied' },
        })
        .expect(403);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'VIEWER' })
        .expect(200);
    });
    it('blocks foreign opening-stock records and redacts replayed sync results after a permission reduction', async () => {
      const foreign = await db.product.findFirstOrThrow({
        where: { businessId: otherShop },
      });
      await call('post', '/sync/push')
        .send({
          entity: 'opening-stock',
          entityId: randomUUID(),
          operationId: randomUUID(),
          action: 'create',
          payload: { productId: foreign.id, quantity: '1' },
        })
        .expect(404);
      expect(
        await db.inventory.count({ where: { productId: foreign.id } }),
      ).toBe(0);
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'ADMIN' })
        .expect(200);
      const current = await db.product.findUniqueOrThrow({
        where: { id: product },
      });
      const command = {
        entity: 'products',
        entityId: product,
        operationId: randomUUID(),
        action: 'update',
        baseRevision: current.revision,
        payload: { name: 'Synced before reduction' },
      };
      const original = await call('post', '/sync/push', viewer)
        .send(command)
        .expect(201);
      expect(original.body.data.record).toHaveProperty('purchasePrice');
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'EDITOR' })
        .expect(200);
      const replay = await call('post', '/sync/push', viewer)
        .send(command)
        .expect(201);
      expect(replay.body.data.record).not.toHaveProperty('purchasePrice');
      await call('patch', `${base()}/members/${viewer.id}`)
        .send({ role: 'VIEWER' })
        .expect(200);
    });
    it('rolls back role creation if the audit write fails', async () => {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION authorization_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ROLE_CREATED' THEN RAISE EXCEPTION 'Test audit storage failure'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        'CREATE TRIGGER authorization_test_audit_failure BEFORE INSERT ON platform_audit_logs FOR EACH ROW EXECUTE FUNCTION authorization_test_reject_audit()',
      );
      try {
        await call('post', `${base()}/roles`)
          .send({
            key: 'ROLLBACK_ROLE',
            name: 'Must roll back',
            permissions: [],
          })
          .expect(500);
        expect(
          await db.businessRole.count({
            where: { businessId: shop, key: 'ROLLBACK_ROLE' },
          }),
        ).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER authorization_test_audit_failure ON platform_audit_logs',
        );
        await db.$executeRawUnsafe(
          'DROP FUNCTION authorization_test_reject_audit()',
        );
      }
    });
    it('serializes new business ownership with account suspension', async () => {
      const prospective = await account();
      const [creation, suspension] = await Promise.all([
        call('post', '/businesses', prospective).send({
          name: 'Concurrent creation',
          slug: randomUUID(),
        }),
        call(
          'patch',
          `/platform-admin/users/${prospective.id}/status`,
          operator,
        ).send({ ...reason, isActive: false }),
      ]);
      if (creation.status === 201) {
        shops.push(creation.body.data.id);
        expect(suspension.status).toBe(403);
      } else {
        expect([401, 403]).toContain(creation.status);
        expect(suspension.status).toBe(200);
      }
      const memberships = await db.businessUser.findMany({
        where: { userId: prospective.id, role: 'OWNER' },
        include: { user: true },
      });
      expect(memberships.every((m) => m.user.isActive)).toBe(true);
    });
    it('keeps an active owner during concurrent demotions and blocks sole-owner account suspension', async () => {
      const first = await account();
      const second = await account();
      const id = await business(first);
      await call('post', `/businesses/${id}/access/members`, first, id)
        .send({ email: second.email, role: 'OWNER' })
        .expect(201);
      const responses = await Promise.all([
        call(
          'patch',
          `/businesses/${id}/access/members/${second.id}`,
          first,
          id,
        ).send({ role: 'VIEWER' }),
        call(
          'patch',
          `/businesses/${id}/access/members/${first.id}`,
          second,
          id,
        ).send({ role: 'VIEWER' }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 403]);
      expect(
        await db.businessUser.count({
          where: {
            businessId: id,
            role: 'OWNER',
            isActive: true,
            user: { isActive: true },
          },
        }),
      ).toBe(1);
      const survivor = await db.businessUser.findFirstOrThrow({
        where: { businessId: id, role: 'OWNER' },
      });
      await call(
        'patch',
        `/platform-admin/users/${survivor.userId}/status`,
        operator,
        id,
      )
        .send({ ...reason, isActive: false })
        .expect(403);
      const nonOwner = survivor.userId === first.id ? second : first;
      await call(
        'patch',
        `/platform-admin/users/${nonOwner.id}/status`,
        operator,
        id,
      )
        .send({ ...reason, isActive: false })
        .expect(200);
      await call('get', `/businesses/${id}/access/me`, nonOwner, id).expect(
        401,
      );
      expect(
        await db.platformAuditLog.count({
          where: {
            businessId: id,
            action: 'ACCOUNT_STATUS_CHANGED',
            targetId: nonOwner.id,
          },
        }),
      ).toBe(1);
    });
  },
);
