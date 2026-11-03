import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EMAIL_TAKEN_MESSAGE, SHOP_ID_TAKEN_MESSAGE } from '@invento/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';

// Self-registration from the web panel or the phone, then the first shop.
// Run only against an isolated, migrated test database. Never resets shared tables.
describe.runIf(process.env.RUN_DATABASE_TESTS === '1')(
  'Registration and first shop (PostgreSQL)',
  () => {
    let app: INestApplication;
    let db: PrismaService;
    const ids: string[] = [];
    const businesses: string[] = [];
    const password = 'Register-test-password-123!';
    const server = () => request(app.getHttpServer());
    const call = (method: 'get' | 'post', path: string, token: string) =>
      server()[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
    const freshEmail = () => `${randomUUID()}@registration.test`;
    async function register(email = freshEmail()) {
      const response = await server()
        .post('/api/auth/register')
        .send({ name: 'Registration Test', email, password })
        .expect(201);
      ids.push(response.body.data.user.id);
      return { email, id: response.body.data.user.id as string, token: response.body.data.accessToken as string };
    }
    async function createShop(token: string, slug: string) {
      const response = await call('post', '/businesses', token).send({ name: 'Reg Shop', slug });
      if (response.status === 201) businesses.push(response.body.data.id);
      return response;
    }
    const fieldsWithErrors = (body: { error: { details: { field: string; message: string }[] } }) =>
      body.error.details.map((detail) => detail.field);

    beforeAll(async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(globalValidationPipe);
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalInterceptors(new ResponseInterceptor());
      await app.listen(0, '127.0.0.1');
      db = app.get(PrismaService);
      await db.$connect();
    });
    afterAll(async () => {
      if (db) {
        await db.platformAuditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
        for (const id of businesses) await db.business.delete({ where: { id } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
        await db.$disconnect();
      }
      await app?.close();
    });

    it('creates an ordinary account with a lowercased email and no shops', async () => {
      const email = `Reg-${randomUUID()}@Registration.TEST`;
      const response = await server().post('/api/auth/register').send({ name: 'Registration Test', email, password }).expect(201);
      ids.push(response.body.data.user.id);
      expect(response.body.data.accessToken).toBeTruthy();
      expect(response.body.data.refreshToken).toBeTruthy();
      const stored = await db.user.findUniqueOrThrow({ where: { id: response.body.data.user.id } });
      expect(stored.email).toBe(email.toLowerCase());
      expect(stored.isPlatformAdmin).toBe(false);

      const access = await call('get', '/auth/panel-access', response.body.data.accessToken).expect(200);
      expect(access.body.data).toEqual({ isPlatformAdmin: false, shops: [] });

      const again = await server().post('/api/auth/register').send({ name: 'Registration Test', email: email.toUpperCase(), password }).expect(409);
      expect(again.body.error.message).toBe(EMAIL_TAKEN_MESSAGE);
    });

    it('explains which fields are wrong', async () => {
      const weak = await server().post('/api/auth/register').send({ name: 'Registration Test', email: freshEmail(), password: 'weakpass' }).expect(422);
      expect(weak.body.error.details).toContainEqual({ field: 'password', message: 'password is not strong enough' });

      const email = await server().post('/api/auth/register').send({ name: 'Registration Test', email: 'not-an-email', password }).expect(422);
      expect(fieldsWithErrors(email.body)).toContain('email');

      for (const name of [' ', 'A', 'x'.repeat(101)]) {
        const response = await server().post('/api/auth/register').send({ name, email: freshEmail(), password }).expect(422);
        expect(fieldsWithErrors(response.body)).toContain('name');
      }
    });

    it('cannot be used to grant platform rights or a role', async () => {
      for (const extra of [{ isPlatformAdmin: true }, { role: 'OWNER' }]) {
        const email = freshEmail();
        const response = await server().post('/api/auth/register').send({ name: 'Registration Test', email, password, ...extra }).expect(422);
        expect(response.body.error.details.map((detail: { message: string }) => detail.message)).toContain(`property ${Object.keys(extra)[0]} should not exist`);
        expect(await db.user.findUnique({ where: { email } })).toBeNull();
      }
    });

    it('gives a new account no access to other shops', async () => {
      const other = await register();
      const shop = await createShop(other.token, `reg-${randomUUID()}`);
      const stranger = await register();
      const response = await call('get', `/businesses/${shop.body.data.id}`, stranger.token);
      expect([403, 404]).toContain(response.status);
    });

    it('makes the creator the owner of the new shop, usable from web and phone', async () => {
      const user = await register();
      const slug = `reg-${randomUUID()}`;
      const shop = await createShop(user.token, slug);
      expect(shop.status).toBe(201);
      const access = await call('get', '/auth/panel-access', user.token).expect(200);
      expect(access.body.data.shops.map((s: { id: string }) => s.id)).toEqual([shop.body.data.id]);
      const memberships = await call('get', '/businesses', user.token).expect(200);
      expect(memberships.body.data).toEqual([expect.objectContaining({ role: 'OWNER' })]);
      await call('get', `/businesses/${shop.body.data.id}/users`, user.token).expect(200);

      // The same account signs in on the phone.
      await server().post('/api/auth/login').send({ email: user.email, password }).expect(201);
    });

    it('normalizes the shop ID instead of rejecting it', async () => {
      const user = await register();
      const id = randomUUID();
      const shop = await createShop(user.token, `Reg Shop ${id}!`);
      expect(shop.status).toBe(201);
      expect(shop.body.data.slug).toBe(`reg-shop-${id}`);
    });

    it('reports a taken shop ID in plain words and leaves no partial shop', async () => {
      const first = await register();
      const slug = `reg-${randomUUID()}`;
      expect((await createShop(first.token, slug)).status).toBe(201);
      const second = await register();
      const counts = () => Promise.all([db.business.count(), db.businessRole.count(), db.customer.count({ where: { isWalkIn: true } })]);
      const before = await counts();
      const taken = await createShop(second.token, slug);
      expect(taken.status).toBe(409);
      expect(taken.body.error.message).toBe(SHOP_ID_TAKEN_MESSAGE);
      expect(await counts()).toEqual(before);
    });
  },
);
