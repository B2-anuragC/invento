import type { ProductRecord, SupplierRecord } from './api';
export function supplierOffersProduct(supplier: Pick<SupplierRecord, 'categories' | 'productIds'> | undefined, product: Pick<ProductRecord, 'id' | 'category'>) {
  if (!supplier) return false;
  if (!supplier.categories?.length && !supplier.productIds?.length) return true;
  return Boolean(supplier.productIds?.includes(product.id) || (product.category && supplier.categories?.includes(product.category)));
}
