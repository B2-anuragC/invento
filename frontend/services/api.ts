export type SellingOption = { id: string; name: string; unit: string; quantity: string; sellingPrice: string; piecesPerUnit?: number };
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { configureOffline, offlineView, saveOfflineCatalog, saveOfflineOpening, requireSyncedCatalog, refreshOfflineSnapshot, rememberConfirmedTransaction } from './offline-catalog';
export { hasOfflineBusiness, syncOffline } from './offline-catalog';
const nativeOffline = Platform.OS !== 'web';

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
};

export type AppSession = {
  accessToken: string;
  refreshToken: string;
  businessId: string;
  businessName?: string;
  user: ApiUser;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
};

export type DashboardSummary = {
  date: string;
  timezone: string;
  todaySales: string | number;
  todayPurchases: string | number | null;
  saleCount: number;
  purchaseCount: number;
  productCount: number;
  lowStockCount: number;
  recentTransactions: Array<{
    id: string;
    productId: string;
    type: string;
    quantity: string | number;
    balanceAfter: string | number;
    createdAt: string;
    note?: string | null;
    product?: {
      name: string;
      sku: string;
      unit: string;
  piecesPerUnit?: number | null;
  sellingOptions?: SellingOption[];
  gstRate?: string;
    };
  }>;
};

export type ProductRecord = {
  revision?: number;
  syncState?: string;
  id: string;
  businessId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  unit: string;
  piecesPerUnit?: number | null;
  sellingOptions?: SellingOption[];
  gstRate?: string;
  purchasePrice?: string | null;
  sellingPrice: string;
  minimumStock: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  unit: string;
  piecesPerUnit?: number | null;
  sellingOptions?: SellingOption[];
  gstRate?: string;
  purchasePrice: string;
  sellingPrice: string;
  minimumStock: string;
};

export type CustomerRecord = {
  revision?: number;
  updatedAt?: string;
  syncState?: string;
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: string;
};

export type InventoryRecord = {
  productId: string;
  quantity: string | number;
  createdAt?: string | null;
  updatedAt?: string | null;
  product?: Pick<ProductRecord, 'id' | 'name' | 'sku' | 'unit' | 'status'>;
};

export type InventoryTransactionRecord = {
  productId?: string;
  id: string;
  type: string;
  quantity: string | number;
  balanceAfter: string | number;
  note?: string | null;
  createdAt: string;
};

export type PaymentRecord = { id: string; amount: string | number; method: string; kind: string; paidAt: string };
export type SaleRecord = {
  subtotal?: string | number;
  taxTotal?: string | number;
  amountPaid?: string | number | null;
  dueDate?: string | null;
  requestId?: string | null;
  payments?: PaymentRecord[];
  id: string;
  invoiceNumber?: string | null;
  saleDate: string;
  total: string | number;
  paymentMethod: string;
  note?: string | null;
  customer: { id: string; name: string };
  items: Array<{ id: string; productId: string; unit?: string | null; sellingOptionId?: string | null; optionName?: string | null; unitsPerOption?: string | number; quantity: string | number; gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number; sellingPrice: string | number; product?: { name: string; sku: string; unit: string } }>;
};

export type CreateSaleInput = {
  amountPaid?: string;
  dueDate?: string;
  requestId?: string;
  customerId: string;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  saleDate: string;
  items: Array<{ productId: string; unit?: string; sellingOptionId?: string; quantity: string; sellingPrice: string }>;
};

export type SupplierRecord = {
  revision?: number;
  updatedAt?: string;
  syncState?: string;
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: string;
};

export type PurchaseRecord = {
  subtotal?: string | number;
  taxTotal?: string | number;
  amountPaid?: string | number | null;
  dueDate?: string | null;
  requestId?: string | null;
  payments?: PaymentRecord[];
  id: string;
  invoiceNumber?: string | null;
  purchaseDate: string;
  note?: string | null;
  total?: string | number;
  supplier: { id: string; name: string };
  items: Array<{ id: string; productId: string; quantity: string | number; gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number; purchasePrice?: string | number; product?: { name: string; sku: string; unit: string } }>;
};

export type BusinessUserRecord = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
  user: ApiUser;
};

export type AddedBusinessUserRecord = {
  id: string;
  role: BusinessUserRecord['role'];
  isActive: boolean;
  user: Pick<ApiUser, 'id' | 'name' | 'email'>;
};

export type PricingAccess = {
  membersCanViewPurchasePrice: boolean;
  role: BusinessUserRecord['role'];
};

export type InventoryActivityRecord = InventoryTransactionRecord & {
  product: Pick<ProductRecord, 'id' | 'name' | 'sku' | 'unit'>;
};

export type CreatePurchaseInput = {
  amountPaid?: string;
  dueDate?: string;
  requestId?: string;
  paymentMethod?: CreateSaleInput['paymentMethod'];
  supplierId: string;
  purchaseDate: string;
  invoiceNumber?: string;
  items: Array<{ productId: string; quantity: string; purchasePrice: string }>;
};

export type BusinessMembership = {
  role: string;
  business: { id: string; name: string; slug: string };
};

export type CreateBusinessInput = {
  name: string;
  slug: string;
};

export const appSession: { current: AppSession | null } = {
  current: null,
};

const SESSION_STORAGE_KEY = 'invento.session.v1';

export async function persistSession(session: AppSession): Promise<void> {
  const serialized = JSON.stringify(session);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, serialized);
}

export async function restoreSession(): Promise<AppSession | null> {
  try {
    const serialized = Platform.OS === 'web'
      ? typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null
      : await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (!serialized) return null;

    const session: unknown = JSON.parse(serialized);
    if (
      typeof session !== 'object' || session === null ||
      typeof (session as AppSession).accessToken !== 'string' ||
      typeof (session as AppSession).refreshToken !== 'string' ||
      typeof (session as AppSession).businessId !== 'string' ||
      typeof (session as AppSession).user?.id !== 'string'
    ) {
      await clearPersistedSession();
      return null;
    }
    return session as AppSession;
  } catch {
    await clearPersistedSession();
    return null;
  }
}

export async function clearPersistedSession(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}

const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const apiHost = Platform.OS === 'android' ? expoHost || '10.0.2.2' : 'localhost';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${apiHost}:3000/api`;

let refreshRequest: Promise<AppSession> | null = null;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function latestSession(session: AppSession): AppSession {
  const current = appSession.current;
  return current?.user.id === session.user.id
    ? { ...session, accessToken: current.accessToken, refreshToken: current.refreshToken, user: current.user }
    : session;
}

function getValidationDetailMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const detail = value as Record<string, unknown>;
  const field = typeof detail.field === 'string' ? detail.field.toLowerCase() : '';
  const message = typeof detail.message === 'string' ? detail.message.toLowerCase() : '';

  if (field === 'password' && message) {
    return 'Password needs at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  if (field === 'email' && message.includes('email')) return 'Enter a valid email address.';
  if (field === 'name' && /longer than or equal to 2|at least 2/.test(message)) {
    return 'Name must be at least 2 characters.';
  }
  if (field === 'name' && /match|not be empty/.test(message)) return 'Enter your name.';
  return typeof detail.message === 'string' ? detail.message : null;
}

function getErrorMessage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const messages = value.map(getErrorMessage).filter((message): message is string => Boolean(message));
    return messages.length ? messages.join(', ') : null;
  }
  if (typeof value === 'object' && value !== null) {
    const body = value as Record<string, unknown>;
    const validationMessages = Array.isArray(body.details)
      ? [...new Set(body.details.map(getValidationDetailMessage).filter((message): message is string => Boolean(message)))]
      : [];
    const message = getErrorMessage(body.message);
    if (validationMessages.length && (!message || /validation failed/i.test(message))) {
      return validationMessages.join(' ');
    }
    return message ?? getErrorMessage(body.error);
  }
  return null;
}

async function renewSession(session: AppSession): Promise<AppSession> {
  if (!refreshRequest) {
    refreshRequest = request<LoginResponse>(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) },
      null,
      false,
    ).then(async (tokens) => {
      const current = appSession.current;
      const refreshed = { ...(current?.user.id === session.user.id ? current : session), ...tokens };
      appSession.current = refreshed;
      // A device storage failure must not invalidate successfully rotated tokens.
      await persistSession(refreshed).catch(() => undefined);
      return refreshed;
    }).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  session?: AppSession | null,
  canRefresh = true,
): Promise<T> {
  if (session) session = latestSession(session);
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  if (session?.businessId) {
    headers.set('X-Business-Id', session.businessId);
  }

  // console.log('[API request]', options.method ?? 'GET', `${API_BASE_URL}${path}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // console.log('[API response]', response.status, response.url);

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text || 'Request failed.' };
  }

  if (response.status === 401 && session?.refreshToken && canRefresh && path !== '/auth/refresh') {
    let refreshed: AppSession;
    try {
      const current = latestSession(session);
      refreshed = current.accessToken !== session.accessToken ? current : await renewSession(current);
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        appSession.current = null;
        await clearPersistedSession().catch(() => undefined);
        throw new Error('Your session expired. Please sign in again.');
      }
      throw new Error('Could not renew your session. Check your connection and try again.');
    }
    return request<T>(path, options, refreshed, false);
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload?.error) ?? getErrorMessage(payload?.message) ?? 'Request failed.', response.status);
  }

  return payload?.data ?? payload;
}

export async function loginWithEmail(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerWithEmail(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProfile(
  session: AppSession,
  input: { name: string; phone?: string },
): Promise<ApiUser> {
  return request<ApiUser>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function logoutSession(session: AppSession): Promise<void> {
  try {
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } finally {
    appSession.current = null;
    await clearPersistedSession();
  }
}

export async function fetchBusinesses(session: AppSession): Promise<BusinessMembership[]> {
  return request<BusinessMembership[]>('/businesses', { method: 'GET' }, session);
}

export async function createBusiness(
  session: AppSession,
  input: CreateBusinessInput,
): Promise<{ id: string; name: string; slug: string }> {
  return request('/businesses', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchDashboardSummary(session: AppSession): Promise<DashboardSummary> {
  if (nativeOffline) {
    const view = await offlineView(session);
    const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    const dateOf = (value: string) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);
    const sales = view.sales.filter((sale) => dateOf(sale.saleDate) === today);
    const purchases = view.purchases.filter((purchase) => dateOf(purchase.purchaseDate) === today);
    const canViewCosts = view.access.role !== 'MEMBER' || view.access.membersCanViewPurchasePrice;
    return { date: today, timezone: 'Asia/Kolkata', todaySales: sales.reduce((sum, sale) => sum + Number(sale.total), 0), todayPurchases: canViewCosts ? purchases.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0) : null, saleCount: sales.length, purchaseCount: purchases.length, productCount: view.products.filter((product) => product.status === 'ACTIVE').length, lowStockCount: view.products.filter((product) => product.status === 'ACTIVE' && Number(view.inventory.find((stock) => stock.productId === product.id)?.quantity ?? 0) < Number((product as ProductRecord).minimumStock)).length, recentTransactions: view.inventoryActivity.slice(0, 10).map((record) => ({ ...record, productId: record.productId ?? record.product.id })) };
  }
  return request<DashboardSummary>('/dashboard/summary', { method: 'GET' }, session);
}

export async function fetchProducts(
  session: AppSession,
  query: { search?: string; status?: 'ACTIVE' | 'INACTIVE'; category?: string } = {},
): Promise<ProductRecord[]> {
  if (nativeOffline) { const view = await offlineView(session); return (view.products as ProductRecord[]).filter((product) => product.status === (query.status ?? 'ACTIVE') && (!query.category || product.category === query.category) && (!query.search?.trim() || [product.name, product.sku, product.barcode, product.category].some((field) => field?.toLowerCase().includes(query.search!.trim().toLowerCase())))).sort((a, b) => a.name.localeCompare(b.name)); }
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ProductRecord[]>(`/products${suffix}`, { method: 'GET' }, session);
}

export async function fetchProductCategories(session: AppSession): Promise<string[]> {
  if (nativeOffline) return [...new Set((await offlineView(session)).products.filter((product) => product.status === 'ACTIVE').map((product) => (product as ProductRecord).category).filter((value): value is string => Boolean(value)))].sort();
  return request<string[]>('/products/categories', { method: 'GET' }, session);
}

export async function fetchProduct(session: AppSession, productId: string): Promise<ProductRecord> {
  if (nativeOffline) { const product = (await offlineView(session)).products.find((record) => record.id === productId); if (!product) throw new Error('Product not downloaded to this device.'); return product as ProductRecord; }
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, { method: 'GET' }, session);
}

export async function createProduct(session: AppSession, input: ProductInput): Promise<ProductRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'products', { ...input }) as ProductRecord;
  return request<ProductRecord>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
}

export async function updateProduct(
  session: AppSession,
  productId: string,
  input: Partial<ProductInput> & { status?: 'ACTIVE' | 'INACTIVE' },
): Promise<ProductRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'products', { ...input }, productId) as ProductRecord;
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function deactivateProduct(session: AppSession, productId: string): Promise<ProductRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'products', { status: 'INACTIVE' }, productId) as ProductRecord;
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }, session);
}

export async function fetchProductStock(session: AppSession, productId: string): Promise<InventoryRecord> {
  if (nativeOffline) return (await offlineView(session)).inventory.find((record) => record.productId === productId) ?? { productId, quantity: '0', createdAt: null, updatedAt: null };
  return request<InventoryRecord>(`/products/${encodeURIComponent(productId)}/stock`, { method: 'GET' }, session);
}

export async function fetchProductTransactions(
  session: AppSession,
  productId: string,
): Promise<InventoryTransactionRecord[]> {
  if (nativeOffline) return (await offlineView(session)).inventoryActivity.filter((record) => record.productId === productId || record.product.id === productId);
  return request<InventoryTransactionRecord[]>(
    `/products/${encodeURIComponent(productId)}/transactions`,
    { method: 'GET' },
    session,
  );
}

export async function recordOpeningStock(
  session: AppSession,
  productId: string,
  quantity: string,
): Promise<InventoryRecord> {
  if (nativeOffline) return saveOfflineOpening(session, productId, quantity);
  return request<InventoryRecord>('/inventory/opening-stock', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  }, session);
}

export async function fetchCustomers(session: AppSession): Promise<CustomerRecord[]> {
  if (nativeOffline) return (await offlineView(session)).customers.filter((record) => record.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)) as CustomerRecord[];
  return request<CustomerRecord[]>('/customers', { method: 'GET' }, session);
}

export async function createCustomer(
  session: AppSession,
  input: string | { name: string; contactName?: string; phone?: string; email?: string; address?: string },
): Promise<CustomerRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'customers', typeof input === 'string' ? { name: input } : { ...input }) as CustomerRecord;
  const body = typeof input === 'string' ? { name: input } : input;
  return request<CustomerRecord>(
    '/customers',
    { method: 'POST', body: JSON.stringify(body) },
    session,
  );
}

export async function fetchCustomer(session: AppSession, customerId: string): Promise<CustomerRecord> {
  if (nativeOffline) { const record = (await offlineView(session)).customers.find((record) => record.id === customerId); if (!record) throw new Error('Customer not downloaded to this device.'); return record as CustomerRecord; }
  return request<CustomerRecord>(`/customers/${encodeURIComponent(customerId)}`, { method: 'GET' }, session);
}

export async function updateCustomer(
  session: AppSession,
  customerId: string,
  input: Partial<Pick<CustomerRecord, 'name' | 'contactName' | 'phone' | 'email' | 'address' | 'status'>>,
): Promise<CustomerRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'customers', { ...input }, customerId) as CustomerRecord;
  return request<CustomerRecord>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchInventory(session: AppSession, requireFresh = false): Promise<InventoryRecord[]> {
  if (nativeOffline && !requireFresh) return (await offlineView(session)).inventory;
  return request<InventoryRecord[]>('/inventory', { method: 'GET' }, session);
}

export async function fetchSales(session: AppSession, query: { customerId?: string } = {}): Promise<SaleRecord[]> {
  if (nativeOffline) return (await offlineView(session)).sales.filter((sale) => !query.customerId || sale.customer.id === query.customerId);
  const params = new URLSearchParams();
  if (query.customerId) params.set('customerId', query.customerId);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SaleRecord[]>(`/sales${suffix}`, { method: 'GET' }, session);
}

export async function fetchSale(session: AppSession, saleId: string): Promise<SaleRecord> {
  if (nativeOffline) { const sale = (await offlineView(session)).sales.find((record) => record.id === saleId); if (sale) return sale; }
  return request<SaleRecord>(`/sales/${encodeURIComponent(saleId)}`, { method: 'GET' }, session);
}

export async function fetchInventoryActivity(session: AppSession): Promise<InventoryActivityRecord[]> {
  if (nativeOffline) return (await offlineView(session)).inventoryActivity;
  return request<InventoryActivityRecord[]>('/inventory/activity', { method: 'GET' }, session);
}

export async function createSale(session: AppSession, input: CreateSaleInput): Promise<SaleRecord> {
  if (nativeOffline) await requireSyncedCatalog(session, [input.customerId, ...input.items.map((item) => item.productId)]);
  const saved = await request<SaleRecord>('/sales', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
  if (nativeOffline) { await rememberConfirmedTransaction(session, 'sale', saved).catch(() => undefined); await refreshOfflineSnapshot(session); }
  return saved;
}

export async function fetchSuppliers(session: AppSession): Promise<SupplierRecord[]> {
  if (nativeOffline) return (await offlineView(session)).suppliers.filter((record) => record.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)) as SupplierRecord[];
  return request<SupplierRecord[]>('/suppliers', { method: 'GET' }, session);
}

export async function createSupplier(
  session: AppSession,
  input: string | { name: string; contactName?: string; phone?: string; email?: string; address?: string },
): Promise<SupplierRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'suppliers', typeof input === 'string' ? { name: input } : { ...input }) as SupplierRecord;
  const body = typeof input === 'string' ? { name: input } : input;
  return request<SupplierRecord>(
    '/suppliers',
    { method: 'POST', body: JSON.stringify(body) },
    session,
  );
}

export async function fetchSupplier(session: AppSession, supplierId: string): Promise<SupplierRecord> {
  if (nativeOffline) { const record = (await offlineView(session)).suppliers.find((record) => record.id === supplierId); if (!record) throw new Error('Supplier not downloaded to this device.'); return record as SupplierRecord; }
  return request<SupplierRecord>(`/suppliers/${encodeURIComponent(supplierId)}`, { method: 'GET' }, session);
}

export async function updateSupplier(
  session: AppSession,
  supplierId: string,
  input: Partial<Pick<SupplierRecord, 'name' | 'contactName' | 'phone' | 'email' | 'address' | 'status'>>,
): Promise<SupplierRecord> {
  if (nativeOffline) return await saveOfflineCatalog(session, 'suppliers', { ...input }, supplierId) as SupplierRecord;
  return request<SupplierRecord>(`/suppliers/${encodeURIComponent(supplierId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchPurchases(session: AppSession, query: { supplierId?: string } = {}): Promise<PurchaseRecord[]> {
  if (nativeOffline) return (await offlineView(session)).purchases.filter((purchase) => !query.supplierId || purchase.supplier.id === query.supplierId);
  const params = new URLSearchParams();
  if (query.supplierId) params.set('supplierId', query.supplierId);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<PurchaseRecord[]>(`/purchases${suffix}`, { method: 'GET' }, session);
}

export async function fetchBusinessUsers(session: AppSession): Promise<BusinessUserRecord[]> {
  return request<BusinessUserRecord[]>(`/businesses/${encodeURIComponent(session.businessId)}/users`, { method: 'GET' }, session);
}

export async function addBusinessUser(
  session: AppSession,
  input: { email: string; role: 'ADMIN' | 'MEMBER' },
): Promise<AddedBusinessUserRecord> {
  return request<AddedBusinessUserRecord>(`/businesses/${encodeURIComponent(session.businessId)}/users`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
}

export async function updateBusinessUser(
  session: AppSession,
  userId: string,
  role: BusinessUserRecord['role'],
): Promise<{ id: string; role: BusinessUserRecord['role']; isActive: boolean }> {
  return request<{ id: string; role: BusinessUserRecord['role']; isActive: boolean }>(`/businesses/${encodeURIComponent(session.businessId)}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  }, session);
}

export async function removeBusinessUser(session: AppSession, userId: string): Promise<void> {
  await request(`/businesses/${encodeURIComponent(session.businessId)}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  }, session);
}

export async function fetchPricingAccess(session: AppSession): Promise<PricingAccess> {
  if (nativeOffline) return (await offlineView(session)).access;
  return request<PricingAccess>(`/businesses/${encodeURIComponent(session.businessId)}/pricing-access`, { method: 'GET' }, session);
}

export async function updatePricingAccess(session: AppSession, membersCanViewPurchasePrice: boolean): Promise<Pick<PricingAccess, 'membersCanViewPurchasePrice'>> {
  return request<Pick<PricingAccess, 'membersCanViewPurchasePrice'>>(
    `/businesses/${encodeURIComponent(session.businessId)}/pricing-access`,
    { method: 'PATCH', body: JSON.stringify({ membersCanViewPurchasePrice }) },
    session,
  );
}

export async function createPurchase(session: AppSession, input: CreatePurchaseInput): Promise<PurchaseRecord> {
  if (nativeOffline) await requireSyncedCatalog(session, [input.supplierId, ...input.items.map((item) => item.productId)]);
  const saved = await request<PurchaseRecord>('/purchases', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
  if (nativeOffline) { await rememberConfirmedTransaction(session, 'purchase', saved).catch(() => undefined); await refreshOfflineSnapshot(session); }
  return saved;
}

export async function fetchPurchase(session: AppSession, purchaseId: string): Promise<PurchaseRecord> {
  if (nativeOffline) { const purchase = (await offlineView(session)).purchases.find((record) => record.id === purchaseId); if (purchase) return purchase; }
  return request<PurchaseRecord>(`/purchases/${encodeURIComponent(purchaseId)}`, { method: 'GET' }, session);
}

export async function recordTransactionPayment(session: AppSession, kind: 'sale' | 'purchase', id: string, input: { amount: string; method: string; requestId: string; openingAmountPaid?: string }): Promise<SaleRecord | PurchaseRecord> {
  const saved = await request<SaleRecord | PurchaseRecord>(`/${kind}s/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify(input) }, session);
  if (nativeOffline) { await rememberConfirmedTransaction(session, kind, saved).catch(() => undefined); await refreshOfflineSnapshot(session); }
  return saved;
}

configureOffline(async <T>(path: string, options: RequestInit, session: AppSession) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await request<T>(path, { ...options, signal: controller.signal }, session); }
  finally { clearTimeout(timeout); }
}, () => appSession.current);
