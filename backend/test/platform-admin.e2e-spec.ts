import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PlatformAdminService } from '../src/platform-admin/platform-admin.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';

// Run only against an isolated, migrated test database. Never resets shared tables.
describe.runIf(process.env.RUN_DATABASE_TESTS === '1')(
  'Platform administration (PostgreSQL)',
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let admin: { id: string; token: string; refresh: string; email: string };
    let owner: typeof admin;
    let businessId: string;
    const ids: string[] = [];
    const businesses: string[] = [];
    const password = 'Admin-test-password-123!';
    const reason = {
      reason: 'Integration test management action',
      confirmed: true,
    };
    const call = (
      method: 'get' | 'post' | 'patch',
      path: string,
      token = admin.token,
    ) =>
      request(app.getHttpServer())
        [method](`/api${path}`)
        .set('Authorization', `Bearer ${token}`);
    async function account() {
      const email = `${randomUUID()}@platform.test`;
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, name: 'Platform Test', password })
        .expect(201);
      const result = {
        id: response.body.data.user.id,
        token: response.body.data.accessToken,
        refresh: response.body.data.refreshToken,
        email,
      };
      ids.push(result.id);
      return result;
    }
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(globalValidationPipe);
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalInterceptors(new ResponseInterceptor());
      // Keep one listener alive; avoid Supertest opening/closing sockets between requests.
      await app.listen(0, '127.0.0.1');
      db = app.get(PrismaService);
      await db.$connect();
    });
    beforeEach(async () => {
      admin = await account();
      owner = await account();
      await db.user.update({
        where: { id: admin.id },
        data: { isPlatformAdmin: true },
      });
      const business = await call('post', '/businesses', owner.token)
        .send({ name: 'Tenant test', slug: randomUUID() })
        .expect(201);
      businessId = business.body.data.id;
      businesses.push(businessId);
    });
    afterEach(async () => {
      await db.platformAuditLog.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
      });
      for (const id of businesses.splice(0))
        await db.business.delete({ where: { id } });
      await db.user.deleteMany({ where: { id: { in: ids.splice(0) } } });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await app?.close();
    });

    it('protects every platform route and rejects public privilege assignment', async () => {
      const routes: ['get' | 'post' | 'patch', string][] = [
        ['get', '/platform-admin/me'],
        ['get', '/platform-admin/overview'],
        ['get', '/platform-admin/businesses'],
        ['get', `/platform-admin/businesses/${businessId}`],
        ...[
          'members',
          'products',
          'sales',
          'purchases',
          'inventory-movements',
        ].map(
          (r) =>
            ['get', `/platform-admin/businesses/${businessId}/${r}`] as [
              'get',
              string,
            ],
        ),
        ['get', '/platform-admin/users'],
        ['get', `/platform-admin/users/${owner.id}`],
        ['get', `/platform-admin/users/${owner.id}/sessions`],
        ['get', '/platform-admin/audit-logs'],
        ['patch', `/platform-admin/businesses/${businessId}/status`],
        ['patch', `/platform-admin/users/${owner.id}/status`],
        ['post', `/platform-admin/users/${owner.id}/revoke-sessions`],
      ];
      for (const [method, path] of routes) {
        await request(app.getHttpServer())[method](`/api${path}`).expect(401);
        await call(method, path, owner.token).expect(403);
      }
      await call('patch', '/auth/me', owner.token)
        .send({ name: 'Owner', isPlatformAdmin: true })
        .expect(422);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Escalate',
          email: `${randomUUID()}@platform.test`,
          password,
          isPlatformAdmin: true,
        })
        .expect(422);
    });
    it('opens owner panels without platform grants and scopes shop actions on the server', async () => {
      await request(app.getHttpServer()).get('/api/auth/panel-access').expect(401);
      const access = await call('get', '/auth/panel-access', owner.token).expect(200);
      expect(access.body.data.isPlatformAdmin).toBe(false);
      expect(access.body.data.shops.map((s: { id: string }) => s.id)).toEqual([businessId]);
      const outsider = await account();
      const outsiderAccess = await call('get', '/auth/panel-access', outsider.token).expect(200);
      expect(outsiderAccess.body.data.shops).toEqual([]);
      await call('post', '/products', outsider.token).set('X-Business-Id', businessId)
        .send({ name: 'Forbidden', sku: 'DENIED', unit: 'KG', purchasePrice: '1', sellingPrice: '2', minimumStock: '0' })
        .expect(403);
      const product = await call('post', '/products').set('X-Business-Id', businessId)
        .send({ name: 'Operator product', sku: 'OPERATOR', unit: 'KG', purchasePrice: '1', sellingPrice: '2', minimumStock: '0' })
        .expect(201);
      await call('patch', `/products/${product.body.data.id}`, owner.token).set('X-Business-Id', businessId)
        .send({ name: 'Owner updated product' }).expect(200);
      await call('get', `/products/${product.body.data.id}`, outsider.token).set('X-Business-Id', businessId).expect(403);
      expect(await db.businessUser.findUnique({ where: { businessId_userId: { businessId, userId: admin.id } } })).toBeNull();
      await call('get', '/platform-admin/users', owner.token).expect(403);
    });

    it('suspends all business API access while preserving login and reactivates it', async () => {
      await call('patch', `/platform-admin/businesses/${businessId}/status`)
        .send({ ...reason, isActive: false })
        .expect(200);
      for (const path of [
        '/products',
        '/inventory',
        '/sales',
        '/purchases',
        '/suppliers',
        '/customers',
        '/dashboard/summary',
        `/businesses/${businessId}`,
      ]) {
        await call('get', path, owner.token)
          .set('X-Business-Id', businessId)
          .expect(403);
      }
      await call('post', '/products', owner.token)
        .set('X-Business-Id', businessId)
        .send({
          name: 'Blocked',
          sku: 'BLOCKED',
          unit: 'KG',
          purchasePrice: '1',
          sellingPrice: '2',
          minimumStock: '0',
        })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password })
        .expect(201);
      const audit = await db.platformAuditLog.findFirstOrThrow({
        where: { targetId: businessId },
      });
      expect(audit).toMatchObject({
        actorId: admin.id,
        action: 'SUSPEND',
        previous: { isActive: true },
        next: { isActive: false },
        reason: reason.reason,
      });
      await call('patch', `/platform-admin/businesses/${businessId}/status`)
        .send({ ...reason, isActive: true })
        .expect(200);
      await call('get', '/products', owner.token)
        .set('X-Business-Id', businessId)
        .expect(200);
    });
    it('rejects cross-business access and foreign product/customer/supplier relationships', async () => {
      const outsider = await account();
      await call('get', '/products', outsider.token)
        .set('X-Business-Id', businessId)
        .expect(403);
      const other = await call('post', '/businesses', owner.token)
        .send({ name: 'Other tenant', slug: randomUUID() })
        .expect(201);
      const otherId = other.body.data.id;
      businesses.push(otherId);
      const create = (path: string, body: object, business = businessId) =>
        call('post', path, owner.token)
          .set('X-Business-Id', business)
          .send(body);
      const customer = await create(
        '/customers',
        { name: 'Foreign customer' },
        otherId,
      ).expect(201);
      const supplier = await create(
        '/suppliers',
        { name: 'Foreign supplier' },
        otherId,
      ).expect(201);
      const product = await create(
        '/products',
        {
          name: 'Foreign product',
          sku: 'FOREIGN',
          unit: 'KG',
          purchasePrice: '1',
          sellingPrice: '2',
          minimumStock: '0',
        },
        otherId,
      ).expect(201);
      await create('/sales', {
        customerId: customer.body.data.id,
        saleDate: new Date().toISOString(),
        paymentMethod: 'CASH',
        items: [
          { productId: product.body.data.id, quantity: '1', sellingPrice: '2' },
        ],
      }).expect(404);
      await create('/purchases', {
        supplierId: supplier.body.data.id,
        purchaseDate: new Date().toISOString(),
        items: [
          {
            productId: product.body.data.id,
            quantity: '1',
            purchasePrice: '1',
          },
        ],
      }).expect(404);
      const localCustomer = await create('/customers', {
        name: 'Local customer',
      }).expect(201);
      const localSupplier = await create('/suppliers', {
        name: 'Local supplier',
      }).expect(201);
      await create('/sales', {
        customerId: localCustomer.body.data.id,
        saleDate: new Date().toISOString(),
        paymentMethod: 'CASH',
        items: [
          { productId: product.body.data.id, quantity: '1', sellingPrice: '2' },
        ],
      }).expect(404);
      await create('/purchases', {
        supplierId: localSupplier.body.data.id,
        purchaseDate: new Date().toISOString(),
        items: [
          {
            productId: product.body.data.id,
            quantity: '1',
            purchasePrice: '1',
          },
        ],
      }).expect(404);
      expect(await db.sale.count({ where: { businessId } })).toBe(0);
      expect(await db.purchase.count({ where: { businessId } })).toBe(0);
    });
    it('revokes issued access/refresh tokens and blocks disabled-user login', async () => {
      await call('post', `/platform-admin/users/${owner.id}/revoke-sessions`)
        .send(reason)
        .expect(201);
      await call('get', '/auth/me', owner.token).expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: owner.refresh })
        .expect(401);
      const session = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password })
        .expect(201);
      owner.token = session.body.data.accessToken;
      await call('patch', `/platform-admin/users/${owner.id}/status`)
        .send({ ...reason, isActive: false })
        .expect(200);
      await call('get', '/auth/me', owner.token).expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password })
        .expect(401);
      await call('patch', `/platform-admin/users/${owner.id}/status`)
        .send({ ...reason, isActive: true })
        .expect(200);
      await call('get', '/auth/me', owner.token).expect(401);
      const fresh = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: owner.email, password })
        .expect(201);
      await call('get', '/auth/me', fresh.body.data.accessToken).expect(200);
    });
    it('protects the last administrator and validates management confirmation', async () => {
      await call('patch', `/platform-admin/users/${admin.id}/status`)
        .send({ ...reason, isActive: false })
        .expect(403);
      await call('patch', `/platform-admin/businesses/${businessId}/status`)
        .send({ isActive: false, reason: '   ', confirmed: false })
        .expect(422);
      await call('patch', `/platform-admin/businesses/${businessId}/status`)
        .send({ ...reason, isActive: 'false' })
        .expect(422);
      await call('patch', `/platform-admin/businesses/${businessId}/status`)
        .send({ ...reason, confirmed: 'false', isActive: false })
        .expect(422);
      expect(
        (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
          .isActive,
      ).toBe(true);
      expect(
        await db.platformAuditLog.count({ where: { actorId: admin.id } }),
      ).toBe(0);
    });
    it('paginates without secrets and returns database-backed dashboard calculations', async () => {
      const page = await call(
        'get',
        '/platform-admin/users?page=1&pageSize=1',
      ).expect(200);
      expect(page.body.data.items).toHaveLength(1);
      expect(page.body.data.total).toBe(await db.user.count());
      expect(JSON.stringify(page.body)).not.toMatch(
        /passwordHash|tokenHash|sessionVersion/,
      );
      await call('get', '/platform-admin/users?pageSize=101').expect(422);
      const result = (
        await call(
          'get',
          '/platform-admin/overview?from=2026-10-01&to=2026-11-01',
        ).expect(200)
      ).body.data;
      expect(result.users).toBe(await db.user.count());
      expect(result.businesses).toBe(await db.business.count());
      expect(result.products).toBe(await db.product.count());
      const sessions = (
        await call('get', `/platform-admin/users/${owner.id}/sessions`).expect(
          200,
        )
      ).body.data;
      expect(sessions.total).toBe(1);
      expect(JSON.stringify(sessions)).not.toContain('tokenHash');
    });
    it('rolls back the status change when persisting its audit event fails', async () => {
      // Exercise the real database transaction with an intentionally invalid audit field.
      await expect(
        app.get(PlatformAdminService).manage(admin.id, 'business', businessId, {
          isActive: false,
          confirmed: true,
          reason: undefined as unknown as string,
        }),
      ).rejects.toThrow();
      expect(
        (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
          .isActive,
      ).toBe(true);
      expect(
        await db.platformAuditLog.count({ where: { targetId: businessId } }),
      ).toBe(0);
    });
    it('serializes concurrent administrator disablement and preserves one active admin', async () => {
      await db.user.update({
        where: { id: owner.id },
        data: { isPlatformAdmin: true },
      });
      const results = await Promise.all([
        call('patch', `/platform-admin/users/${owner.id}/status`).send({
          ...reason,
          isActive: false,
        }),
        call(
          'patch',
          `/platform-admin/users/${admin.id}/status`,
          owner.token,
        ).send({ ...reason, isActive: false }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 403]);
      expect(
        await db.user.count({
          where: {
            id: { in: [admin.id, owner.id] },
            isPlatformAdmin: true,
            isActive: true,
          },
        }),
      ).toBe(1);
    });

    it('grants platform access through the audited operator command', async () => {
      await promisify(execFile)(process.execPath, [
        'scripts/grant-platform-admin.mjs',
        owner.email,
        'Bootstrap integration verification',
      ]);
      await call('get', '/platform-admin/me', owner.token).expect(200);
      const entry = await db.platformAuditLog.findFirstOrThrow({
        where: { targetId: owner.id, action: 'GRANT_PLATFORM_ADMIN' },
      });
      expect(entry.actorId).toMatch(/^operator:/);
      expect(entry.next).toEqual({ isPlatformAdmin: true });
    });
  },
);
