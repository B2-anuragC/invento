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
  createPurchase,
  createSupplier,
  fetchInventory,
  fetchProducts,
  fetchSuppliers,
  type ProductRecord,
  type SupplierRecord,
} from '@/services/api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function CreatePurchaseScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [error, setError] = useState('');
  const [dialogMode, setDialogMode] = useState<'confirm' | 'success' | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const loadFormData = async () => {
      const session = appSession.current;
      if (!session) {
        setError('Sign in before recording a purchase.');
        setLoading(false);
        return;
      }

      try {
        const [productData, inventoryData, supplierData] = await Promise.all([
          fetchProducts(session),
          fetchInventory(session),
          fetchSuppliers(session),
        ]);
        setProducts(productData);
        setSuppliers(supplierData);
        setStock(
          inventoryData.reduce<Record<string, number>>((balances, item) => {
            balances[item.productId] = Number(item.quantity);
            return balances;
          }, {}),
        );
        setPrices(
          productData.reduce<Record<string, string>>((values, product) => {
            values[product.id] = String(product.purchasePrice ?? '');
            return values;
          }, {}),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load purchase details.');
      } finally {
        setLoading(false);
      }
    };

    void loadFormData();
  }, []);

  const purchaseItems = useMemo(
    () =>
      products.flatMap((product) => {
        const quantity = Number(quantities[product.id] ?? 0);
        const price = Number(prices[product.id] ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return [];
        }
        return [{ product, quantity, price }];
      }),
    [products, quantities, prices],
  );
  const total = purchaseItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const linesValid = purchaseItems.every((item) => item.price > 0);
  const canSubmit = Boolean(supplierId) && purchaseItems.length > 0 && linesValid && !saving;

  const changeQuantity = (productId: string, value: string) => {
    if (/^\d*(?:\.\d{0,3})?$/.test(value)) {
      setQuantities((current) => ({ ...current, [productId]: value }));
    }
  };

  const changePrice = (productId: string, value: string) => {
    if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
      setPrices((current) => ({ ...current, [productId]: value }));
    }
  };

  const addSupplier = async () => {
    const name = supplierName.trim();
    const session = appSession.current;
    if (!name || !session) {
      return;
    }

    setAddingSupplier(true);
    setError('');
    try {
      const supplier = await createSupplier(session, name);
      setSuppliers((current) => [...current, supplier].sort((left, right) => left.name.localeCompare(right.name)));
      setSupplierId(supplier.id);
      setSupplierName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not add supplier.');
    } finally {
      setAddingSupplier(false);
    }
  };

  const savePurchase = async () => {
    const session = appSession.current;
    if (!session || !canSubmit) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createPurchase(session, {
        supplierId,
        purchaseDate: new Date().toISOString(),
        ...(invoiceNumber.trim() ? { invoiceNumber: invoiceNumber.trim() } : {}),
        items: purchaseItems.map(({ product, quantity, price }) => ({
          productId: product.id,
          quantity: String(quantity),
          purchasePrice: price.toFixed(2),
        })),
      });
      setSuccessMessage(`${formatMoney(total)} was recorded and stock was updated.`);
      setDialogMode('success');
    } catch (saveError) {
      setDialogMode(null);
      setError(saveError instanceof Error ? saveError.message : 'Could not record purchase.');
    } finally {
      setSaving(false);
    }
  };

  const confirmPurchase = () => {
    if (!canSubmit) {
      return;
    }
    setDialogMode('confirm');
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color="#1F9D68" />
        <Text style={styles.loadingText}>Loading products and suppliers</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹  Purchases</Text>
        </Pressable>
        <Text style={styles.title}>Add purchase</Text>
        <Text style={styles.subtitle}>Enter the supplier invoice and items received.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Supplier</Text>
        {suppliers.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceList}>
            {suppliers.map((supplier) => {
              const selected = supplier.id === supplierId;
              return (
                <Pressable
                  key={supplier.id}
                  onPress={() => setSupplierId(supplier.id)}
                  style={[styles.choiceChip, selected && styles.choiceChipSelected]}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{supplier.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.helperText}>Add a supplier to continue.</Text>
        )}
        <View style={styles.addRow}>
          <TextInput
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="New supplier name"
            placeholderTextColor="#9CA3AF"
            style={styles.textInput}
            returnKeyType="done"
          />
          <Pressable
            accessibilityRole="button"
            disabled={!supplierName.trim() || addingSupplier}
            onPress={() => void addSupplier()}
            style={[styles.smallButton, (!supplierName.trim() || addingSupplier) && styles.buttonDisabled]}>
            <Text style={styles.smallButtonText}>{addingSupplier ? 'Adding' : 'Add'}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Invoice</Text>
        <TextInput
          value={invoiceNumber}
          onChangeText={setInvoiceNumber}
          placeholder="Invoice number (optional)"
          placeholderTextColor="#9CA3AF"
          style={styles.textInput}
          maxLength={80}
        />

        <Text style={styles.sectionTitle}>Products received</Text>
        {products.length ? (
          products.map((product) => {
            const quantity = quantities[product.id] ?? '';
            const price = prices[product.id] ?? '';
            const invalidPrice = Number(quantity) > 0 && Number(price) <= 0;
            return (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productHeader}>
                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productMeta}>{product.sku} · Current stock: {stock[product.id] ?? 0} {product.unit}</Text>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Quantity ({product.unit})</Text>
                    <TextInput
                      accessibilityLabel={`${product.name} received quantity`}
                      value={quantity}
                      onChangeText={(value) => changeQuantity(product.id, value)}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      style={styles.numberInput}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Unit cost</Text>
                    <TextInput
                      accessibilityLabel={`${product.name} purchase price`}
                      value={price}
                      onChangeText={(value) => changePrice(product.id, value)}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      style={[styles.numberInput, invalidPrice && styles.inputInvalid]}
                    />
                  </View>
                  <Text style={styles.lineTotal}>
                    {formatMoney(Math.max(0, Number(quantity) * Number(price)))}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.helperText}>No active products found for this business.</Text>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Purchase total</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>
        {purchaseItems.length ? (
          <Text style={styles.itemCount}>{purchaseItems.length} item{purchaseItems.length === 1 ? '' : 's'} selected</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={confirmPurchase}
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}>
          <Text style={styles.submitText}>{saving ? 'Recording purchase…' : 'Review and record purchase'}</Text>
        </Pressable>
      </ScrollView>
      <ConfirmationDialog
        visible={dialogMode !== null}
        title={dialogMode === 'success' ? 'Purchase recorded' : 'Confirm purchase'}
        message={dialogMode === 'success'
          ? successMessage
          : `${purchaseItems.length} product${purchaseItems.length === 1 ? '' : 's'} · ${formatMoney(total)}`}
        confirmLabel={dialogMode === 'success' ? 'Done' : saving ? 'Recording…' : 'Record purchase'}
        cancelLabel={dialogMode === 'confirm' ? 'Review' : undefined}
        onCancel={() => setDialogMode(null)}
        onConfirm={() => {
          if (dialogMode === 'success') {
            router.back();
          } else {
            void savePurchase();
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
  choiceList: {
    gap: 8,
    paddingBottom: 4,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  choiceChipSelected: {
    borderColor: '#1F9D68',
    backgroundColor: '#E9F9F1',
  },
  choiceText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#0F766E',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  textInput: {
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
  buttonDisabled: {
    opacity: 0.45,
  },
  productCard: {
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 5,
  },
  numberInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    paddingHorizontal: 10,
    fontSize: 14,
  },
  inputInvalid: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  lineTotal: {
    width: 74,
    textAlign: 'right',
    paddingBottom: 10,
    color: '#374151',
    fontSize: 11,
    fontWeight: '700',
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
    color: '#B45309',
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
