import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';

// Opt in against a migrated development/test database. Each test creates and
// removes only its own tenant and user fixtures; no shared data is reset.
describe.runIf(process.env.RUN_DATABASE_TESTS === '1')('Customers and sales (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let businessId: string;
  let customerId: string;
  let products: string[];
  const businessIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(globalValidationPipe);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });

  function api(method: 'get' | 'post' | 'patch' | 'delete', path: string, tenant = businessId) {
    return request(app.getHttpServer())[method](`/api${path}`).set('Authorization', `Bearer ${token}`).set('X-Business-Id', tenant);
  }

  function input(quantity = '20', productId = products[0]) {
    return { customerId, saleDate: '2026-09-20', paymentMethod: 'CASH', invoiceNumber: 'SALE-TEST', items: [{ productId, quantity, sellingPrice: '50.00' }] };
  }

  beforeEach(async () => {
    const id = randomUUID();
    const auth = await request(app.getHttpServer()).post('/api/auth/register').send({ name: 'Sales Test', email: `${id}@sales.test`, password: 'Test-password-123!' }).expect(201);
    token = auth.body.data.accessToken;
    userId = auth.body.data.user.id;
    const business = await api('post', '/businesses', 'unused').send({ name: 'Sales Test', slug: id }).expect(201);
    businessId = business.body.data.id;
    businessIds.push(businessId);
    const customer = await api('post', '/customers').send({ name: 'Customer Test' }).expect(201);
    customerId = customer.body.data.id;
    products = [];
    for (let index = 0; index < 3; index++) {
      const product = await api('post', '/products').send({ name: `Product ${index}`, sku: `SKU-${index}`, unit: 'KG', purchasePrice: '40', sellingPrice: '50', minimumStock: '0' }).expect(201);
      products.push(product.body.data.id);
      await api('post', '/inventory/opening-stock').send({ productId: products[index], quantity: '100' }).expect(201);
    }
    products.sort((a, b) => a.localeCompare(b));
  });

  afterEach(async () => {
    // Remove dependent fixtures in FK order, scoped exclusively to this test.
    for (const id of businessIds.splice(0)) {
      await prisma.sale.deleteMany({ where: { businessId: id } });
      await prisma.purchase.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  it('verifies 100 + 50 - 20 = 130, rejects oversell, and preserves immutable items', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Supplier Test' }).expect(201);
    await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: [{ productId: products[0], quantity: '50', purchasePrice: '40' }] }).expect(201);
    const sale = await api('post', '/sales').send(input()).expect(201);
    expect(sale.body.data.total).toBe('1000');
    expect(sale.body.data.paymentMethod).toBe('CASH');
    await api('post', '/sales').send(input('200')).expect(400);
    const stock = await api('get', `/inventory/${products[0]}`).expect(200);
    expect(stock.body.data.quantity).toBe('130');
    const ledger = await api('get', `/inventory/${products[0]}/history`).expect(200);
    expect(ledger.body.data.filter((entry: { type: string }) => entry.type === 'SALE')).toMatchObject([{ quantity: '-20', balanceAfter: '130', note: `Sale ${sale.body.data.id}` }]);
    await api('patch', `/sales/${sale.body.data.id}`).send({ items: input().items }).expect(422);
    await api('patch', `/sales/${sale.body.data.id}`).send({ customerId, total: '1', status: 'CANCELLED' }).expect(422);
    await api('patch', `/sales/${sale.body.data.id}`).send({ note: 'Receipt issued', invoiceNumber: 'UPDATED' }).expect(200);
    const detail = await api('get', `/sales/${sale.body.data.id}`).expect(200);
    expect(detail.body.data).toMatchObject({ note: 'Receipt issued', invoiceNumber: 'UPDATED', total: '1000' });
    const history = await api('get', `/sales?customerId=${customerId}`).expect(200);
    expect(history.body.data).toHaveLength(1);
  });

  it('rolls back the sale, first item and ledger when item two of three oversells', async () => {
    const before = await prisma.inventory.findMany({ where: { businessId }, orderBy: { productId: 'asc' } });
    const sale = input();
    sale.items = products.map((productId, index) => ({ productId, quantity: index === 1 ? '200' : '10', sellingPrice: '5.00' }));
    await api('post', '/sales').send(sale).expect(400);
    expect(await prisma.sale.count({ where: { businessId } })).toBe(0);
    expect(await prisma.saleItem.count({ where: { productId: { in: products } } })).toBe(0);
    expect(await prisma.inventoryTransaction.count({ where: { businessId, type: 'SALE' } })).toBe(0);
    const after = await prisma.inventory.findMany({ where: { businessId }, orderBy: { productId: 'asc' } });
    expect(after).toEqual(before);
  });

  it('serializes competing sales so only one can consume the available balance', async () => {
    const results = await Promise.all([api('post', '/sales').send(input('80')), api('post', '/sales').send(input('80'))]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    const stock = await prisma.inventory.findUniqueOrThrow({ where: { productId: products[0] } });
    expect(stock.quantity.toString()).toBe('20');
    expect(await prisma.sale.count({ where: { businessId } })).toBe(1);
    expect(await prisma.inventoryTransaction.count({ where: { businessId, type: 'SALE' } })).toBe(1);
  });

  it('enforces customer lifecycle and preserves historical sales', async () => {
    const sale = await api('post', '/sales').send(input()).expect(201);
    await api('patch', `/customers/${customerId}`).send({ name: 'Renamed Customer' }).expect(200);
    await api('delete', `/customers/${customerId}`).expect(200);
    expect((await api('get', '/customers').expect(200)).body.data).toEqual([]);
    expect((await api('get', '/customers?status=INACTIVE').expect(200)).body.data).toHaveLength(1);
    expect((await api('get', `/customers/${customerId}`).expect(200)).body.data.status).toBe('INACTIVE');
    await api('post', '/sales').send(input()).expect(409);
    expect((await api('get', `/sales/${sale.body.data.id}`).expect(200)).body.data.customer.status).toBe('INACTIVE');
    await api('patch', `/customers/${customerId}`).send({ status: 'ACTIVE' }).expect(200);
    await api('post', '/sales').send(input()).expect(201);
  });

  it('rejects cross-tenant references and unauthorized reads/writes', async () => {
    const other = await api('post', '/businesses').send({ name: 'Other Test', slug: randomUUID() }).expect(201);
    const otherId = other.body.data.id;
    businessIds.push(otherId);
    const sale = await api('post', '/sales').send(input()).expect(201);
    await api('get', `/customers/${customerId}`, otherId).expect(404);
    await api('patch', `/customers/${customerId}`, otherId).send({ name: 'Wrong tenant' }).expect(404);
    await api('delete', `/customers/${customerId}`, otherId).expect(404);
    await api('get', `/sales/${sale.body.data.id}`, otherId).expect(404);
    await api('patch', `/sales/${sale.body.data.id}`, otherId).send({ note: 'Wrong tenant' }).expect(404);
    await api('post', '/sales', otherId).send(input()).expect(404);
    const otherCustomer = await api('post', '/customers', otherId).send({ name: 'Other Customer' }).expect(201);
    await api('post', '/sales').send({ ...input(), customerId: otherCustomer.body.data.id }).expect(404);
    await api('post', '/sales', otherId).send({ ...input(), customerId: otherCustomer.body.data.id }).expect(404);
    await api('get', '/customers', 'not-a-member').expect(403);
    await request(app.getHttpServer()).get('/api/sales').expect(401);
    await request(app.getHttpServer()).get('/api/customers').set('Authorization', `Bearer ${token}`).expect(400);
    await prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { role: 'MEMBER' } });
    await api('get', '/sales').expect(200);
    await api('get', '/customers').expect(200);
    await api('post', '/sales').send(input()).expect(403);
    await api('patch', `/sales/${sale.body.data.id}`).send({ note: 'Denied' }).expect(403);
    await api('post', '/customers').send({ name: 'Denied' }).expect(403);
    await api('delete', `/customers/${customerId}`).expect(403);
    await prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { isActive: false } });
    await api('get', '/sales').expect(403);
    await api('get', '/customers').expect(403);
  });

  it('validates payment method, item values, duplicates and product status', async () => {
    await api('post', '/sales').send({ ...input(), paymentMethod: 'INVALID' }).expect(422);
    await api('post', '/sales').send({ ...input(), items: [] }).expect(422);
    await api('post', '/sales').send(input('0')).expect(400);
    await api('post', '/sales').send(input('-1')).expect(422);
    await api('post', '/sales').send({ ...input(), items: [{ ...input().items[0], sellingPrice: '0' }] }).expect(400);
    await api('post', '/sales').send({ ...input(), items: [...input().items, ...input().items] }).expect(400);
    await api('delete', `/products/${products[0]}`).expect(200);
    await api('post', '/sales').send(input()).expect(409);
    expect(await prisma.sale.count({ where: { businessId } })).toBe(0);
  });
});
