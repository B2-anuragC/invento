import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen, ConfirmationDialog } from '@/components/invento-ui';
import {
  appSession,
  createCustomer,
  createSale,
  fetchCustomers,
  fetchInventory,
  fetchProducts,
  type CustomerRecord,
  type InventoryRecord,
  type ProductRecord,
} from '@/services/api';

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function CreateSaleScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [error, setError] = useState('');
  const [dialogMode, setDialogMode] = useState<'confirm' | 'success' | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const clearErrorOnEdit = () => {
    if (error) setError('');
  };

  useEffect(() => {
    const loadFormData = async () => {
      const session = appSession.current;
      if (!session) {
        setError('Sign in before recording a sale.');
        setLoading(false);
        return;
      }

      try {
        const [productData, inventoryData, customerData] = await Promise.all([
          fetchProducts(session),
          fetchInventory(session),
          fetchCustomers(session),
        ]);
        setProducts(productData);
        setCustomers(customerData);
        setStock(
          inventoryData.reduce<Record<string, number>>((balances, item: InventoryRecord) => {
            balances[item.productId] = Number(item.quantity);
            return balances;
          }, {}),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load sale details.');
      } finally {
        setLoading(false);
      }
    };

    void loadFormData();
  }, []);

  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const query = customerSearch.trim().toLowerCase();
        if (!query) return true;
        return (
          customer.name.toLowerCase().includes(query) ||
          customer.phone?.toLowerCase().includes(query)
        );
      }),
    [customerSearch, customers],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const query = productSearch.trim().toLowerCase();
        if (!query) return true;
        return (
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query) ||
          (product.barcode ?? '').toLowerCase().includes(query)
        );
      }),
    [productSearch, products],
  );

  const saleItems = useMemo(
    () =>
      products.flatMap((product) => {
        const quantity = Number(quantities[product.id] ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return [];
        }
        return [{ product, quantity, price: Number(product.sellingPrice) }];
      }),
    [products, quantities],
  );
  const total = saleItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const quantitiesValid = saleItems.every(
    (item) => item.price > 0 && item.quantity <= (stock[item.product.id] ?? 0),
  );
  const canSubmit = Boolean(customerId) && saleItems.length > 0 && quantitiesValid && !saving;

  const changeQuantity = (productId: string, value: string) => {
    if (!/^\d*(?:\.\d{0,3})?$/.test(value)) {
      return;
    }
    setQuantities((current) => ({ ...current, [productId]: value }));
    clearErrorOnEdit();
  };

  const addCustomer = async () => {
    const name = customerName.trim();
    const session = appSession.current;
    if (!name || !session) {
      return;
    }

    setAddingCustomer(true);
    setError('');
    try {
      const customer = await createCustomer(session, name);
      setCustomers((current) => [...current, customer].sort((left, right) => left.name.localeCompare(right.name)));
      setCustomerId(customer.id);
      setCustomerName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not add customer.');
    } finally {
      setAddingCustomer(false);
    }
  };

  const saveSale = async () => {
    const session = appSession.current;
    if (!session || !canSubmit) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createSale(session, {
        customerId,
        paymentMethod,
        saleDate: new Date().toISOString(),
        items: saleItems.map(({ product, quantity, price }) => ({
          productId: product.id,
          quantity: String(quantity),
          sellingPrice: price.toFixed(2),
        })),
      });
      setSuccessMessage(`${formatMoney(total)} was recorded and stock was updated.`);
      setDialogMode('success');
    } catch (saveError) {
      setDialogMode(null);
      setError(saveError instanceof Error ? saveError.message : 'Could not record sale.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSale = () => {
    if (!canSubmit) {
      return;
    }
    setDialogMode('confirm');
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color="#1F9D68" />
        <Text style={styles.loadingText}>Loading products and customers</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹  Sales</Text>
        </Pressable>
        <Text style={styles.title}>New sale</Text>
        <Text style={styles.subtitle}>Select a customer, add items, and review before recording.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Customer</Text>
        <TextInput
          value={customerSearch}
          onChangeText={(value) => {
            setCustomerSearch(value);
            clearErrorOnEdit();
          }}
          placeholder="Search customer or recent names"
          placeholderTextColor="#9CA3AF"
          style={styles.customerInput}
          autoCapitalize="words"
        />
        {filteredCustomers.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customerList}>
            {filteredCustomers.map((customer) => {
              const selected = customer.id === customerId;
              return (
                <Pressable
                  key={customer.id}
                  onPress={() => setCustomerId(customer.id)}
                  style={[styles.customerChip, selected && styles.customerChipSelected]}>
                  <Text style={[styles.customerChipText, selected && styles.customerChipTextSelected]}>
                    {customer.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.helperText}>No customer matches. Add a new customer below.</Text>
        )}
        <View style={styles.addCustomerRow}>
          <TextInput
            value={customerName}
            onChangeText={(value) => {
              setCustomerName(value);
              clearErrorOnEdit();
            }}
            placeholder="New customer name"
            placeholderTextColor="#9CA3AF"
            style={styles.customerInput}
            returnKeyType="done"
          />
          <Pressable
            accessibilityRole="button"
            disabled={!customerName.trim() || addingCustomer}
            onPress={() => void addCustomer()}
            style={[styles.smallButton, (!customerName.trim() || addingCustomer) && styles.buttonDisabled]}>
            <Text style={styles.smallButtonText}>{addingCustomer ? 'Adding' : 'Add'}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Products</Text>
        <TextInput
          value={productSearch}
          onChangeText={(value) => {
            setProductSearch(value);
            clearErrorOnEdit();
          }}
          placeholder="Search products by name, SKU, or barcode"
          placeholderTextColor="#9CA3AF"
          style={styles.customerInput}
          autoCapitalize="none"
        />
        {filteredProducts.length ? (
          filteredProducts.map((product) => {
            const available = stock[product.id] ?? 0;
            const quantity = quantities[product.id] ?? '';
            const invalid = Number(quantity) > available;
            return (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productDetails}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>{product.sku} · {formatMoney(Number(product.sellingPrice))} / {product.unit}</Text>
                  <Text style={[styles.stockText, available <= 0 && styles.stockEmpty]}>
                    {available > 0 ? `${available} ${product.unit} available` : 'No stock recorded'}
                  </Text>
                </View>
                <View style={styles.quantityControl}>
                  <Pressable
                    accessibilityLabel={`Decrease ${product.name} quantity`}
                    disabled={!Number(quantity)}
                    onPress={() => changeQuantity(product.id, String(Math.max(0, Number(quantity) - 1)))}
                    style={[styles.stepButton, !Number(quantity) && styles.buttonDisabled]}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <TextInput
                    accessibilityLabel={`${product.name} quantity`}
                    value={quantity}
                    onChangeText={(value) => changeQuantity(product.id, value)}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    style={[styles.quantityInput, invalid && styles.quantityInputInvalid]}
                  />
                  <Pressable
                    accessibilityLabel={`Increase ${product.name} quantity`}
                    disabled={available <= Number(quantity)}
                    onPress={() => changeQuantity(product.id, String(Number(quantity || 0) + 1))}
                    style={[styles.stepButton, available <= Number(quantity) && styles.buttonDisabled]}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.helperText}>No products match the current search.</Text>
        )}

        <Text style={styles.sectionTitle}>Payment method</Text>
        <View style={styles.paymentList}>
          {paymentMethods.map((method) => {
            const selected = paymentMethod === method.value;
            return (
              <Pressable
                key={method.value}
                onPress={() => setPaymentMethod(method.value)}
                style={[styles.paymentOption, selected && styles.paymentOptionSelected]}>
                <Text style={[styles.paymentText, selected && styles.paymentTextSelected]}>{method.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>
        {saleItems.length ? (
          <Text style={styles.itemCount}>{saleItems.length} item{saleItems.length === 1 ? '' : 's'} selected</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={confirmSale}
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}>
          <Text style={styles.submitText}>{saving ? 'Recording sale…' : 'Review and record sale'}</Text>
        </Pressable>
      </ScrollView>
      <ConfirmationDialog
        visible={dialogMode !== null}
        title={dialogMode === 'success' ? 'Sale recorded' : 'Confirm sale'}
        message={dialogMode === 'success'
          ? successMessage
          : `${saleItems.length} product${saleItems.length === 1 ? '' : 's'} · ${formatMoney(total)} · ${paymentMethods.find((method) => method.value === paymentMethod)?.label}`}
        confirmLabel={dialogMode === 'success' ? 'Done' : saving ? 'Recording…' : 'Record sale'}
        cancelLabel={dialogMode === 'confirm' ? 'Review' : undefined}
        onCancel={() => setDialogMode(null)}
        onConfirm={() => {
          if (dialogMode === 'success') {
            router.back();
          } else {
            void saveSale();
          }
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 12,
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F766E',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 18,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    backgroundColor: '#FEECEC',
    borderRadius: 10,
    padding: 12,
    color: '#B91C1C',
    fontSize: 13,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 18,
    marginBottom: 10,
  },
  customerList: {
    gap: 8,
    paddingBottom: 4,
  },
  customerChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  customerChipSelected: {
    borderColor: '#1F9D68',
    backgroundColor: '#E9F9F1',
  },
  customerChipText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  customerChipTextSelected: {
    color: '#0F766E',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  addCustomerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  customerInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
  smallButton: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1F9D68',
    paddingHorizontal: 14,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
  },
  productDetails: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  productMeta: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 11,
  },
  stockText: {
    marginTop: 4,
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '600',
  },
  stockEmpty: {
    color: '#B45309',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepButton: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F9F1',
    borderRadius: 8,
  },
  stepText: {
    color: '#0F766E',
    fontSize: 19,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  quantityInput: {
    width: 44,
    height: 36,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    color: '#111827',
    paddingHorizontal: 4,
  },
  quantityInputInvalid: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  paymentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  paymentOptionSelected: {
    borderColor: '#1F9D68',
    backgroundColor: '#E9F9F1',
  },
  paymentText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  paymentTextSelected: {
    color: '#0F766E',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
    marginTop: 24,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F766E',
  },
  itemCount: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'right',
  },
  submitButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F9D68',
    borderRadius: 14,
    marginTop: 18,
  },
  submitDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
