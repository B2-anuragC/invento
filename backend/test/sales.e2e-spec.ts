import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { globalValidationPipe } from '../src/common/pipes/validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Opt in against a migrated development/test database. Each test creates and
// removes only its own tenant and user fixtures; no shared data is reset.
describe.runIf(process.env.RUN_DATABASE_TESTS === '1')('Customers and sales (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let refreshToken: string;
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
    refreshToken = auth.body.data.refreshToken;
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

  it('completes the non-AI workflow and verifies dashboard metrics against known amounts', async () => {
    const now = new Date().toISOString();
    const today = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
    const supplier = await api('post', '/suppliers').send({ name: 'Dashboard Supplier' }).expect(201);
    await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: now, items: [{ productId: products[0], quantity: '50', purchasePrice: '40' }] }).expect(201);
    await api('post', '/sales').send({ ...input(), saleDate: now }).expect(201);
    await api('post', '/sales').send({ ...input('200'), saleDate: now }).expect(400);
    await api('patch', `/products/${products[0]}`).send({ minimumStock: '140' }).expect(200);
    expect((await api('get', `/inventory/${products[0]}`).expect(200)).body.data.quantity).toBe('130');
    const ledger = (await api('get', `/inventory/${products[0]}/history`).expect(200)).body.data;
    expect(ledger.map((row: any) => row.type).sort()).toEqual(['OPENING_STOCK', 'PURCHASE', 'SALE']);
    const summary = (await api('get', '/dashboard/summary').expect(200)).body.data;
    expect(summary).toMatchObject({ date: today, timezone: 'Asia/Kolkata', todaySales: '1000', todayPurchases: '2000', saleCount: 1, purchaseCount: 1, productCount: 3, lowStockCount: 1 });
    expect(summary.recentTransactions).toHaveLength(5);
    expect(summary.recentTransactions.some((row: any) => row.type === 'SALE' && row.quantity === '-20')).toBe(true);
    const range = `from=${today}&to=${today}`;
    expect((await api('get', `/dashboard/sales?${range}`).expect(200)).body.data).toMatchObject({ total: '1000', count: 1, days: [{ date: today, total: '1000', count: 1 }] });
    expect((await api('get', `/dashboard/purchases?${range}`).expect(200)).body.data).toMatchObject({ total: '2000', count: 1 });
    expect((await api('get', `/dashboard/top-products?${range}`).expect(200)).body.data.items).toMatchObject([{ productId: products[0], quantity: '20', revenue: '1000' }]);
    expect((await api('get', '/dashboard/low-stock').expect(200)).body.data).toMatchObject([{ productId: products[0], quantity: '130', minimumStock: '140' }]);
    const other = await api('post', '/businesses').send({ name: 'Empty business', slug: randomUUID() }).expect(201);
    businessIds.push(other.body.data.id);
    expect((await api('get', '/dashboard/summary', other.body.data.id).expect(200)).body.data).toMatchObject({ todaySales: '0', todayPurchases: '0', productCount: 0, lowStockCount: 0, recentTransactions: [] });
    for (const path of ['sales', 'purchases']) {
      expect((await api('get', `/dashboard/${path}?${range}`, other.body.data.id).expect(200)).body.data).toMatchObject({ total: '0', count: 0, days: [{ date: today, total: '0', count: 0 }] });
    }
    expect((await api('get', `/dashboard/top-products?${range}`, other.body.data.id).expect(200)).body.data.items).toEqual([]);
    expect((await api('get', '/dashboard/low-stock', other.body.data.id).expect(200)).body.data).toEqual([]);
  });

  it('uses inclusive India dates, excludes incomplete transactions, and ranks by revenue', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Boundary supplier' }).expect(201);
    const entries = [
      ['2026-09-19T18:29:59.999Z', '1'], ['2026-09-19T18:30:00.000Z', '2'],
      ['2026-09-20T18:29:59.999Z', '3'], ['2026-09-20T18:30:00.000Z', '4'],
    ];
    for (const [date, quantity] of entries) {
      await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: date, items: [{ productId: products[0], quantity, purchasePrice: '10' }] }).expect(201);
      await api('post', '/sales').send({ ...input(quantity), saleDate: date }).expect(201);
    }
    const excludedSale = await api('post', '/sales').send({ ...input('1'), saleDate: '2026-09-20' }).expect(201);
    await prisma.sale.update({ where: { id: excludedSale.body.data.id }, data: { status: 'CANCELLED' } });
    const excludedPurchase = await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: [{ productId: products[0], quantity: '1', purchasePrice: '10' }] }).expect(201);
    await prisma.purchase.update({ where: { id: excludedPurchase.body.data.id }, data: { status: 'DRAFT' } });
    const range = 'from=2026-09-20&to=2026-09-20';
    expect((await api('get', `/dashboard/sales?${range}`).expect(200)).body.data).toMatchObject({ total: '250', count: 2 });
    expect((await api('get', `/dashboard/purchases?${range}`).expect(200)).body.data).toMatchObject({ total: '50', count: 2 });
    await api('post', '/sales').send({ ...input('1', products[1]), saleDate: '2026-09-20', items: [{ productId: products[1], quantity: '1', sellingPrice: '300' }] }).expect(201);
    await api('delete', `/products/${products[1]}`).expect(200);
    const top = (await api('get', `/dashboard/top-products?${range}&limit=1`).expect(200)).body.data.items;
    expect(top).toMatchObject([{ productId: products[1], revenue: '300', quantity: '1' }]);
    const days = (await api('get', '/dashboard/sales?from=2026-09-19&to=2026-09-22').expect(200)).body.data.days;
    expect(days.map((day: any) => day.total)).toEqual(['50', '550', '200', '0']);
  });

  it('includes uninitialized low stock, excludes equal thresholds and inactive products, and paginates', async () => {
    await api('patch', `/products/${products[0]}`).send({ minimumStock: '101' }).expect(200);
    await api('patch', `/products/${products[1]}`).send({ minimumStock: '100' }).expect(200);
    await api('patch', `/products/${products[2]}`).send({ minimumStock: '101', status: 'INACTIVE' }).expect(200);
    const uninitialized = await api('post', '/products').send({ name: 'Uninitialized', sku: 'NO-STOCK', unit: 'KG', purchasePrice: '1', sellingPrice: '2', minimumStock: '1' }).expect(201);
    const rows = (await api('get', '/dashboard/low-stock').expect(200)).body.data;
    expect(rows.map((row: any) => row.productId).sort()).toEqual([products[0], uninitialized.body.data.id].sort());
    expect(rows.find((row: any) => row.productId === uninitialized.body.data.id).quantity).toBe('0');
    expect((await api('get', '/dashboard/low-stock?limit=1&offset=1').expect(200)).body.data).toEqual([rows[1]]);
    expect((await api('get', '/dashboard/summary').expect(200)).body.data).toMatchObject({ productCount: 3, lowStockCount: 2 });
  });

  it('validates dashboard queries and enforces active membership on every endpoint', async () => {
    for (const query of ['from=2026-02-30', 'from=invalid', 'to=2026-09-20T00:00:00Z']) await api('get', `/dashboard/sales?${query}`).expect(422);
    for (const query of ['from=2026-09-21&to=2026-09-20', 'from=2025-01-01&to=2026-09-20']) await api('get', `/dashboard/sales?${query}`).expect(400);
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=100001']) await api('get', `/dashboard/low-stock?${query}`).expect(422);
    await api('get', '/dashboard/top-products?limit=101').expect(422);
    await api('get', '/dashboard/sales?businessId=other').expect(422);
    await request(app.getHttpServer()).get('/api/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(400);
    await prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { role: 'MEMBER' } });
    for (const path of ['summary', 'sales', 'purchases', 'low-stock', 'top-products']) {
      await api('get', `/dashboard/${path}`).expect(200);
      await api('get', `/dashboard/${path}`, 'not-a-member').expect(403);
      await request(app.getHttpServer()).get(`/api/dashboard/${path}`).expect(401);
    }
    await prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { isActive: false } });
    for (const path of ['summary', 'sales', 'purchases', 'low-stock', 'top-products']) await api('get', `/dashboard/${path}`).expect(403);
  });

  it('rejects a disabled user with an existing access token on all protected modules', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    for (const path of ['/auth/me', `/businesses/${businessId}`, '/products', '/inventory', '/suppliers', '/purchases', '/customers', '/sales', '/dashboard/summary']) await api('get', path).expect(401);
    await api('post', '/sales').send(input()).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(await prisma.sale.count({ where: { businessId } })).toBe(0);
  });

  it('rounds purchase lines before summing and rolls back a multi-item stock overflow', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Rounding supplier' }).expect(201);
    const purchase = await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: products.slice(0, 2).map((productId) => ({ productId, quantity: '0.125', purchasePrice: '0.12' })) }).expect(201);
    expect(purchase.body.data.total).toBe('0.04');
    expect(purchase.body.data.items.map((item: any) => item.lineTotal)).toEqual(['0.02', '0.02']);
    await api('post', '/inventory/adjustments').send({ productId: products[1], type: 'ADJUSTMENT_IN', quantity: '999999899.874' }).expect(201);
    const before = await prisma.inventory.findMany({ where: { businessId }, orderBy: { id: 'asc' } });
    const ledgerCount = await prisma.inventoryTransaction.count({ where: { businessId } });
    await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: products.slice(0, 2).map((productId) => ({ productId, quantity: '1', purchasePrice: '1' })) }).expect(400);
    expect(await prisma.purchase.count({ where: { businessId } })).toBe(1);
    expect(await prisma.purchaseItem.count({ where: { purchase: { businessId } } })).toBe(2);
    expect(await prisma.inventory.findMany({ where: { businessId }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await prisma.inventoryTransaction.count({ where: { businessId } })).toBe(ledgerCount);
    await api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: [{ productId: products[0], quantity: '999999999', purchasePrice: '9999999999' }] }).expect(400);
  });

  it('rejects null updates, oversized amounts, and owner demotion without server errors', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Validation supplier' }).expect(201);
    for (const path of [`/suppliers/${supplier.body.data.id}`, `/products/${products[0]}`, `/businesses/${businessId}`]) await api('patch', path).send({ name: '   ' }).expect(422);
    for (const field of ['name', 'phone', 'email', 'contactName', 'address', 'status']) await api('patch', `/suppliers/${supplier.body.data.id}`).send({ [field]: null }).expect(422);
    for (const field of ['name', 'barcode', 'purchasePrice', 'sellingPrice', 'minimumStock', 'status']) await api('patch', `/products/${products[0]}`).send({ [field]: null }).expect(422);
    for (const field of ['name', 'email', 'phone', 'address']) await api('patch', `/businesses/${businessId}`).send({ [field]: null }).expect(422);
    await api('patch', `/products/${products[0]}`).send({ purchasePrice: '10000000000' }).expect(422);
    await api('patch', `/products/${products[0]}`).send({ minimumStock: '1000000000' }).expect(422);
    await api('patch', `/businesses/${businessId}/users/${userId}`).send({ role: 'MEMBER' }).expect(403);
    expect((await prisma.businessUser.findUniqueOrThrow({ where: { businessId_userId: { businessId, userId } } })).role).toBe('OWNER');
  });

  it('serializes opposite-order multi-product purchases and sales without deadlocks or overselling', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Concurrent supplier' }).expect(201);
    const purchaseItems = products.slice(0, 2).map((productId) => ({ productId, quantity: '10', purchasePrice: '1' }));
    const purchase = (items: typeof purchaseItems) => api('post', '/purchases').send({ supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items });
    expect((await Promise.all([purchase(purchaseItems), purchase([...purchaseItems].reverse())])).map((response) => response.status)).toEqual([201, 201]);
    const saleItems = products.slice(0, 2).map((productId) => ({ productId, quantity: '80', sellingPrice: '1' }));
    const sale = (items: typeof saleItems) => api('post', '/sales').send({ ...input(), items });
    expect((await Promise.all([sale(saleItems), sale([...saleItems].reverse())])).map((response) => response.status).sort()).toEqual([201, 400]);
    for (const productId of products.slice(0, 2)) expect((await api('get', `/inventory/${productId}`).expect(200)).body.data.quantity).toBe('40');
  });

  it('verifies login, safe identity responses, logout, and duplicate business conflicts', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'Test-password-123!' }).expect(201);
    expect(login.body.data.user).not.toHaveProperty('passwordHash');
    const me = await api('get', '/auth/me').expect(200);
    expect(me.body.data).toMatchObject({ id: userId, isActive: true });
    expect(me.body.data).not.toHaveProperty('passwordHash');
    const members = await api('get', `/businesses/${businessId}/users`).expect(200);
    expect(members.body.data[0].user).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'Wrong-password-123!' }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: login.body.data.refreshToken }).expect(201);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.data.refreshToken }).expect(401);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const duplicate = await api('post', '/businesses').send({ name: 'Duplicate', slug: business.slug }).expect(409);
    expect(JSON.stringify(duplicate.body)).not.toContain('Prisma');
  });

  it('enforces ownership and manager permissions in the older inventory and purchase APIs', async () => {
    const supplier = await api('post', '/suppliers').send({ name: 'Scoped supplier' }).expect(201);
    const payload = { supplierId: supplier.body.data.id, purchaseDate: '2026-09-20', items: [{ productId: products[0], quantity: '1', purchasePrice: '1' }] };
    const purchase = await api('post', '/purchases').send(payload).expect(201);
    const other = await api('post', '/businesses').send({ name: 'Other tenant', slug: randomUUID() }).expect(201);
    const otherId = other.body.data.id;
    businessIds.push(otherId);
    for (const path of [`/products/${products[0]}`, `/inventory/${products[0]}`, `/inventory/${products[0]}/history`, `/suppliers/${supplier.body.data.id}`, `/purchases/${purchase.body.data.id}`]) await api('get', path, otherId).expect(404);
    await api('patch', `/suppliers/${supplier.body.data.id}`, otherId).send({ name: 'Forbidden' }).expect(404);
    await api('patch', `/purchases/${purchase.body.data.id}`, otherId).send({ note: 'Forbidden' }).expect(404);
    await api('post', '/purchases', otherId).send(payload).expect(404);
    for (const path of ['/products', '/inventory', '/suppliers', '/purchases']) expect((await api('get', path, otherId).expect(200)).body.data).toEqual([]);
    await api('post', '/purchases').send({ ...payload, purchaseDate: '2026-02-30' }).expect(422);
    await api('post', '/sales').send({ ...input(), saleDate: '2026-02-30' }).expect(422);
    await api('patch', `/purchases/${purchase.body.data.id}`).send({ items: [] }).expect(422);
    await api('patch', `/purchases/${purchase.body.data.id}`).send({ purchaseDate: null }).expect(422);
    await prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { role: 'MEMBER' } });
    await api('post', '/purchases').send(payload).expect(403);
    await api('post', '/inventory/adjustments').send({ productId: products[0], type: 'DAMAGE', quantity: '1' }).expect(403);
    await api('patch', `/products/${products[0]}`).send({ name: 'Forbidden' }).expect(403);
    await api('delete', `/suppliers/${supplier.body.data.id}`).expect(403);
    await api('patch', `/businesses/${businessId}`).send({ name: 'Forbidden' }).expect(403);
    await api('get', `/businesses/${otherId}/users`).expect(200);
  });

  it('publishes all dashboard operations and query constraints in OpenAPI', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    for (const path of ['summary', 'sales', 'purchases', 'low-stock', 'top-products']) {
      const operation = document.paths[`/api/dashboard/${path}`].get!;
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(operation.parameters).toContainEqual(expect.objectContaining({ name: 'X-Business-Id', required: true }));
    }
    expect(document.paths['/api/dashboard/sales'].get!.parameters).toContainEqual(expect.objectContaining({ name: 'from' }));
    expect(document.paths['/api/dashboard/low-stock'].get!.parameters).toContainEqual(expect.objectContaining({ name: 'limit' }));
  });

  it('allows only one concurrent refresh and rejects replay of the consumed token', async () => {
    const refresh = () => request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
    const results = await Promise.all([refresh(), refresh()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
    await refresh().expect(401);
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);
    const replacement = results.find((result) => result.status === 201)!.body.data.refreshToken;
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: replacement }).expect(201);
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);
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
