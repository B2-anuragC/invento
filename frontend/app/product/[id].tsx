import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen } from '@/components/invento-ui';
import {
  appSession,
  createProduct,
  deactivateProduct,
  fetchProduct,
  fetchProductStock,
  fetchProductTransactions,
  recordOpeningStock,
  updateProduct,
  type InventoryRecord,
  type InventoryTransactionRecord,
  type ProductInput,
  type ProductRecord,
} from '@/services/api';

const productUnits = ['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'PACK', 'BOX', 'DOZEN', 'OTHER'];
const moneyPattern = /^\d{0,10}(?:\.\d{0,2})?$/;
const quantityPattern = /^\d{0,9}(?:\.\d{0,3})?$/;

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number, unit: string) {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)} ${unit.toLowerCase()}`;
}

function decimalValue(value: string, precision: number) {
  const [whole = '0', fraction = ''] = (value || '0').split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  return `${normalizedWhole}.${fraction.padEnd(precision, '0').slice(0, precision)}`;
}

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const isNew = id === 'new';
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [inventory, setInventory] = useState<InventoryRecord | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransactionRecord[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState('PIECE');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [minimumStock, setMinimumStock] = useState('0');
  const [openingStock, setOpeningStock] = useState('');
  const [editing, setEditing] = useState(isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(created === '1' ? 'Product added. Record its opening stock to enable sales and purchases.' : '');

  useEffect(() => {
    if (isNew) return;
    let active = true;
    setLoading(true);
    setError('');
    const session = appSession.current;
    if (!session) {
      router.replace('/auth/login');
      return () => { active = false; };
    }

    Promise.all([
      fetchProduct(session, id),
      fetchProductStock(session, id),
      fetchProductTransactions(session, id),
    ])
      .then(([productData, stockData, transactionData]) => {
        if (!active) return;
        setProduct(productData);
        setInventory(stockData);
        setTransactions(transactionData);
        setEditing(false);
        setNotice(created === '1' ? 'Product added. Record its opening stock to enable sales and purchases.' : '');
        setName(productData.name);
        setSku(productData.sku);
        setBarcode(productData.barcode ?? '');
        setUnit(productData.unit);
        setPurchasePrice(String(productData.purchasePrice));
        setSellingPrice(String(productData.sellingPrice));
        setMinimumStock(String(productData.minimumStock));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load product details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [created, id, isNew, router]);

  const saveProduct = async () => {
    const session = appSession.current;
    if (!session || saving) return;
    const cleanName = name.trim();
    const cleanSku = sku.trim();
    if (cleanName.length < 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(cleanSku)) {
      setError('Enter a product name and a valid SKU (letters, numbers, dot, underscore, or hyphen).');
      return;
    }

    const input: ProductInput = {
      name: cleanName,
      sku: cleanSku,
      barcode: barcode.trim(),
      unit,
      purchasePrice: decimalValue(purchasePrice, 2),
      sellingPrice: decimalValue(sellingPrice, 2),
      minimumStock: decimalValue(minimumStock, 3),
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (isNew) {
        const createdProduct = await createProduct(session, input);
        router.replace(`/product/${createdProduct.id}?created=1`);
      } else {
        const updated = await updateProduct(session, id, input);
        setProduct(updated);
        setEditing(false);
        setNotice('Product details saved.');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const saveOpeningStock = async () => {
    const session = appSession.current;
    if (!session || !product || !quantityPattern.test(openingStock) || openingStock === '') return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const stock = await recordOpeningStock(session, product.id, openingStock);
      const history = await fetchProductTransactions(session, product.id);
      setInventory(stock);
      setTransactions(history);
      setOpeningStock('');
      setNotice('Opening stock recorded. Inventory transactions will update this balance automatically.');
    } catch (stockError) {
      setError(stockError instanceof Error ? stockError.message : 'Could not record opening stock.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = () => {
    if (!product) return;
    const activate = product.status === 'INACTIVE';
    Alert.alert(
      activate ? 'Reactivate product?' : 'Deactivate product?',
      activate ? 'This product will be available for new transactions.' : 'This hides the product from new transactions while preserving its history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activate ? 'Reactivate' : 'Deactivate',
          onPress: () => {
            const session = appSession.current;
            if (!session) return;
            setSaving(true);
            const operation = activate
              ? updateProduct(session, product.id, { status: 'ACTIVE' })
              : deactivateProduct(session, product.id);
            void operation
              .then(setProduct)
              .catch((deactivateError: unknown) => setError(deactivateError instanceof Error ? deactivateError.message : 'Could not update product status.'))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color="#1F9D68" />
        <Text style={styles.helperText}>Loading product</Text>
      </AppScreen>
    );
  }

  if (!isNew && !product) {
    return (
      <AppScreen style={styles.centered}>
        <Text style={styles.error}>{error || 'Product not found.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.smallAction}>
          <Text style={styles.smallActionText}>Back to products</Text>
        </Pressable>
      </AppScreen>
    );
  }

  const currentStock = Number(inventory?.quantity ?? 0);
  const needsOpeningStock = !isNew && inventory?.createdAt === null;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹  Products</Text>
        </Pressable>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{isNew ? 'Add product' : product?.name}</Text>
            {!isNew ? <Text style={styles.subtitle}>{product?.sku} · {product?.status.toLowerCase()}</Text> : null}
          </View>
          {!isNew && !editing ? (
            <Pressable onPress={() => setEditing(true)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {editing ? (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Product details</Text>
            <Text style={styles.label}>Product name</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Basmati Rice" placeholderTextColor="#9CA3AF" maxLength={160} />
            <Text style={styles.label}>SKU</Text>
            <TextInput value={sku} onChangeText={setSku} style={styles.input} placeholder="e.g. RICE-001" placeholderTextColor="#9CA3AF" autoCapitalize="characters" maxLength={64} />
            <Text style={styles.label}>Barcode (optional)</Text>
            <TextInput value={barcode} onChangeText={setBarcode} style={styles.input} placeholder="Scan or enter barcode" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={100} />

            <Text style={styles.label}>Unit</Text>
            <View style={styles.units}>
              {productUnits.map((value) => {
                const selected = unit === value;
                return (
                  <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unitOption, selected && styles.unitSelected]}>
                    <Text style={[styles.unitText, selected && styles.unitTextSelected]}>{value === 'PIECE' ? 'Piece' : value.charAt(0) + value.slice(1).toLowerCase()}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fieldsRow}>
              <View style={styles.field}>
                <Text style={styles.label}>Purchase price</Text>
                <TextInput value={purchasePrice} onChangeText={(value) => moneyPattern.test(value) && setPurchasePrice(value)} style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Selling price</Text>
                <TextInput value={sellingPrice} onChangeText={(value) => moneyPattern.test(value) && setSellingPrice(value)} style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" />
              </View>
            </View>
            <Text style={styles.label}>Low-stock alert level</Text>
            <TextInput value={minimumStock} onChangeText={(value) => quantityPattern.test(value) && setMinimumStock(value)} style={styles.input} placeholder="0" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" />

            <Pressable disabled={saving} onPress={() => void saveProduct()} style={[styles.primaryButton, saving && styles.disabled]}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}</Text>
            </Pressable>
            {!isNew ? <Pressable onPress={() => setEditing(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel editing</Text></Pressable> : null}
          </View>
        ) : (
          <>
            <View style={styles.stockCard}>
              <Text style={styles.stockLabel}>Current stock</Text>
              <Text style={styles.stockValue}>{formatQuantity(currentStock, product?.unit ?? 'PIECE')}</Text>
              <Text style={styles.stockMeta}>Minimum level: {formatQuantity(Number(product?.minimumStock ?? 0), product?.unit ?? 'PIECE')}</Text>
              <Text style={styles.stockMeta}>Buy {formatMoney(Number(product?.purchasePrice ?? 0))} · Sell {formatMoney(Number(product?.sellingPrice ?? 0))}</Text>
            </View>

            {needsOpeningStock ? (
              <View style={styles.openingCard}>
                <Text style={styles.sectionTitle}>Record opening stock</Text>
                <Text style={styles.helperText}>This creates the initial inventory ledger entry. It can only be recorded once.</Text>
                <View style={styles.openingRow}>
                  <TextInput
                    value={openingStock}
                    onChangeText={(value) => quantityPattern.test(value) && setOpeningStock(value)}
                    style={[styles.input, styles.openingInput]}
                    placeholder={`Quantity in ${product?.unit.toLowerCase()}`}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />
                  <Pressable disabled={saving || openingStock === ''} onPress={() => void saveOpeningStock()} style={[styles.smallAction, (saving || openingStock === '') && styles.disabled]}>
                    <Text style={styles.smallActionText}>{saving ? 'Saving' : 'Record'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Stock history</Text>
              <Text style={styles.historyCount}>{transactions.length}</Text>
            </View>
            {transactions.length ? transactions.map((transaction) => (
              <View key={transaction.id} style={styles.historyRow}>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyType}>{transaction.type.replaceAll('_', ' ').toLowerCase()}</Text>
                  <Text style={styles.historyDate}>{new Date(transaction.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                </View>
                <View style={styles.historyAmount}>
                  <Text style={styles.historyQuantity}>{formatQuantity(Number(transaction.quantity), product?.unit ?? 'PIECE')}</Text>
                  <Text style={styles.historyBalance}>Balance {formatQuantity(Number(transaction.balanceAfter), product?.unit ?? 'PIECE')}</Text>
                </View>
              </View>
            )) : <Text style={styles.helperText}>No stock transactions recorded.</Text>}

            <Pressable onPress={toggleActive} style={styles.deactivateButton}>
              <Text style={styles.deactivateText}>{product?.status === 'INACTIVE' ? 'Reactivate product' : 'Deactivate product'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  content: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 12 },
  backText: { fontSize: 15, fontWeight: '700', color: '#0F766E' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#111827', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  form: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 16 },
  sectionTitle: { color: '#111827', fontSize: 16, fontWeight: '700' },
  label: { color: '#374151', fontSize: 12, fontWeight: '700', marginTop: 15, marginBottom: 7 },
  input: { minHeight: 46, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 11, paddingHorizontal: 12, color: '#111827', fontSize: 14 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  unitOption: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  unitSelected: { borderColor: '#1F9D68', backgroundColor: '#E9F9F1' },
  unitText: { color: '#374151', fontSize: 11, fontWeight: '600' },
  unitTextSelected: { color: '#0F766E' },
  fieldsRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 0 },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F9D68', borderRadius: 12, marginTop: 22 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { backgroundColor: '#FEECEC', color: '#B91C1C', borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 16 },
  notice: { backgroundColor: '#E9F9F1', color: '#0F766E', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  stockCard: { backgroundColor: '#E9F9F1', borderRadius: 16, padding: 18, marginBottom: 20 },
  stockLabel: { color: '#0F766E', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  stockValue: { color: '#0F766E', fontSize: 30, fontWeight: '800', marginTop: 8 },
  stockMeta: { color: '#0F766E', fontSize: 12, marginTop: 8 },
  openingCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 15, marginBottom: 22 },
  helperText: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 8 },
  openingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  openingInput: { flex: 1, minWidth: 0 },
  smallAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E9F9F1', paddingHorizontal: 15 },
  smallActionText: { color: '#0F766E', fontSize: 13, fontWeight: '700' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  historyCount: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  historyDetails: { flex: 1, minWidth: 0, marginRight: 12 },
  historyType: { color: '#111827', fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  historyDate: { color: '#6B7280', fontSize: 11, marginTop: 4 },
  historyAmount: { alignItems: 'flex-end' },
  historyQuantity: { color: '#111827', fontSize: 12, fontWeight: '700' },
  historyBalance: { color: '#6B7280', fontSize: 10, marginTop: 4 },
  deactivateButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', marginTop: 28 },
  deactivateText: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
});
