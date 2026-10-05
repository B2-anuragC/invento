import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

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
    };
  }>;
};

export type ProductRecord = {
  id: string;
  businessId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  unit: string;
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
  purchasePrice: string;
  sellingPrice: string;
  minimumStock: string;
};

export type CustomerRecord = {
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
  id: string;
  type: string;
  quantity: string | number;
  balanceAfter: string | number;
  note?: string | null;
  createdAt: string;
};

export type SaleRecord = {
  id: string;
  invoiceNumber?: string | null;
  saleDate: string;
  total: string | number;
  paymentMethod: string;
  customer: { id: string; name: string };
  items: Array<{ id: string; productId: string; quantity: string | number; sellingPrice: string | number }>;
};

export type CreateSaleInput = {
  customerId: string;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  saleDate: string;
  items: Array<{ productId: string; quantity: string; sellingPrice: string }>;
};

export type SupplierRecord = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: string;
};

export type PurchaseRecord = {
  id: string;
  invoiceNumber?: string | null;
  purchaseDate: string;
  total?: string | number;
  supplier: { id: string; name: string };
  items: Array<{ id: string; productId: string; quantity: string | number; purchasePrice?: string | number }>;
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
      const refreshed = { ...session, ...tokens };
      appSession.current = refreshed;
      await persistSession(refreshed);
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

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
      refreshed = await renewSession(session);
    } catch {
      appSession.current = null;
      await clearPersistedSession().catch(() => undefined);
      throw new Error('Your session expired. Please sign in again.');
    }
    return request<T>(path, options, refreshed, false);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload?.error) ?? getErrorMessage(payload?.message) ?? 'Request failed.');
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
  return request<DashboardSummary>('/dashboard/summary', { method: 'GET' }, session);
}

export async function fetchProducts(
  session: AppSession,
  query: { search?: string; status?: 'ACTIVE' | 'INACTIVE'; category?: string } = {},
): Promise<ProductRecord[]> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<ProductRecord[]>(`/products${suffix}`, { method: 'GET' }, session);
}

export async function fetchProductCategories(session: AppSession): Promise<string[]> {
  return request<string[]>('/products/categories', { method: 'GET' }, session);
}

export async function fetchProduct(session: AppSession, productId: string): Promise<ProductRecord> {
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, { method: 'GET' }, session);
}

export async function createProduct(session: AppSession, input: ProductInput): Promise<ProductRecord> {
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
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function deactivateProduct(session: AppSession, productId: string): Promise<ProductRecord> {
  return request<ProductRecord>(`/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }, session);
}

export async function fetchProductStock(session: AppSession, productId: string): Promise<InventoryRecord> {
  return request<InventoryRecord>(`/products/${encodeURIComponent(productId)}/stock`, { method: 'GET' }, session);
}

export async function fetchProductTransactions(
  session: AppSession,
  productId: string,
): Promise<InventoryTransactionRecord[]> {
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
  return request<InventoryRecord>('/inventory/opening-stock', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  }, session);
}

export async function fetchCustomers(session: AppSession): Promise<CustomerRecord[]> {
  return request<CustomerRecord[]>('/customers', { method: 'GET' }, session);
}

export async function createCustomer(
  session: AppSession,
  input: string | { name: string; contactName?: string; phone?: string; email?: string; address?: string },
): Promise<CustomerRecord> {
  const body = typeof input === 'string' ? { name: input } : input;
  return request<CustomerRecord>(
    '/customers',
    { method: 'POST', body: JSON.stringify(body) },
    session,
  );
}

export async function fetchCustomer(session: AppSession, customerId: string): Promise<CustomerRecord> {
  return request<CustomerRecord>(`/customers/${encodeURIComponent(customerId)}`, { method: 'GET' }, session);
}

export async function updateCustomer(
  session: AppSession,
  customerId: string,
  input: Partial<Pick<CustomerRecord, 'name' | 'contactName' | 'phone' | 'email' | 'address' | 'status'>>,
): Promise<CustomerRecord> {
  return request<CustomerRecord>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchInventory(session: AppSession): Promise<InventoryRecord[]> {
  return request<InventoryRecord[]>('/inventory', { method: 'GET' }, session);
}

export async function fetchSales(session: AppSession, query: { customerId?: string } = {}): Promise<SaleRecord[]> {
  const params = new URLSearchParams();
  if (query.customerId) params.set('customerId', query.customerId);
  const suffix = params.size ? `?${params.toString()}` : '';
  return request<SaleRecord[]>(`/sales${suffix}`, { method: 'GET' }, session);
}

export async function fetchSale(session: AppSession, saleId: string): Promise<SaleRecord> {
  return request<SaleRecord>(`/sales/${encodeURIComponent(saleId)}`, { method: 'GET' }, session);
}

export async function fetchInventoryActivity(session: AppSession): Promise<InventoryActivityRecord[]> {
  return request<InventoryActivityRecord[]>('/inventory/activity', { method: 'GET' }, session);
}

export async function createSale(session: AppSession, input: CreateSaleInput): Promise<SaleRecord> {
  return request<SaleRecord>('/sales', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchSuppliers(session: AppSession): Promise<SupplierRecord[]> {
  return request<SupplierRecord[]>('/suppliers', { method: 'GET' }, session);
}

export async function createSupplier(
  session: AppSession,
  input: string | { name: string; contactName?: string; phone?: string; email?: string; address?: string },
): Promise<SupplierRecord> {
  const body = typeof input === 'string' ? { name: input } : input;
  return request<SupplierRecord>(
    '/suppliers',
    { method: 'POST', body: JSON.stringify(body) },
    session,
  );
}

export async function fetchSupplier(session: AppSession, supplierId: string): Promise<SupplierRecord> {
  return request<SupplierRecord>(`/suppliers/${encodeURIComponent(supplierId)}`, { method: 'GET' }, session);
}

export async function updateSupplier(
  session: AppSession,
  supplierId: string,
  input: Partial<Pick<SupplierRecord, 'name' | 'contactName' | 'phone' | 'email' | 'address' | 'status'>>,
): Promise<SupplierRecord> {
  return request<SupplierRecord>(`/suppliers/${encodeURIComponent(supplierId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, session);
}

export async function fetchPurchases(session: AppSession, query: { supplierId?: string } = {}): Promise<PurchaseRecord[]> {
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
  return request<PurchaseRecord>('/purchases', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session);
}
