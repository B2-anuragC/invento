import { ChipRow, HeaderIconButton, ListHeader, SearchField, StatStrip, StickyBar, screenStyles } from '@/components/screen-heading';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen, formatUnitLabel } from '@/components/invento-ui';
import { appSession, fetchInventory, fetchProducts, type InventoryRecord, type ProductRecord } from '@/services/api';
import { formatMoney, formatQuantity } from '@/services/format';
import { usePermissions } from '@/services/permissions';
import { stockValue } from '@/services/stock-value';
import { receiveStockNotice } from '@/services/stock-adjustment';

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  minimumStock: number;
  unit: string;
};

export default function InventoryScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const [filter, setFilter] = useState<'All' | 'Low stock' | 'Out of stock'>('All');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryRecord>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);

  const loadInventory = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    const session = appSession.current;
    if (!session) {
      setProducts([]);
      setInventory({});
      setError('Sign in to view inventory for your business.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [productData, inventoryData] = await Promise.all([
        fetchProducts(session, { status: 'ACTIVE' }),
        fetchInventory(session),
      ]);
      if (requestId.current !== currentRequestId) return;
      setProducts(productData);
      setInventory(inventoryData.reduce<Record<string, InventoryRecord>>((balances, item) => {
        balances[item.productId] = item;
        return balances;
      }, {}));
    } catch (loadError: unknown) {
      if (requestId.current !== currentRequestId) return;
      setProducts([]);
      setInventory({});
      setError(loadError instanceof Error ? loadError.message : 'Could not load inventory.');
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Back from adjusting stock: say what changed; the reload shows the new balance.
      setNotice(receiveStockNotice()?.text ?? '');
      void loadInventory();
      return () => { requestId.current += 1; };
    }, [loadInventory]),
  );

  const stockItems: StockItem[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    quantity: Number(inventory[product.id]?.quantity ?? 0),
    minimumStock: Number(product.minimumStock),
    unit: product.unit,
  }));

  const filteredStockItems = stockItems
    .filter((item) => {
      if (filter === 'Low stock' && !(item.quantity > 0 && item.quantity < item.minimumStock)) return false;
      if (filter === 'Out of stock' && item.quantity > 0) return false;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        formatUnitLabel(item.unit).includes(query)
      );
    })
    .sort((left, right) => {
      const leftRisk = left.quantity <= 0 ? 0 : left.quantity < left.minimumStock ? 1 : 2;
      const rightRisk = right.quantity <= 0 ? 0 : right.quantity < right.minimumStock ? 1 : 2;
      if (leftRisk !== rightRisk) return leftRisk - rightRisk;
      return left.name.localeCompare(right.name);
    });

  const value = stockValue(products, Object.values(inventory), can('pricing.view'));
  const outOfStockCount = stockItems.filter((item) => item.quantity <= 0).length;
  const reorderCount = stockItems.filter((item) => item.quantity <= 0 || item.quantity < item.minimumStock).length;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={screenStyles.listContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets stickyHeaderIndices={[1]}>
        <View>
          <ListHeader title="Inventory" back actions={<HeaderIconButton permission="inventory.adjust" icon="swap-vertical-outline" text="Adjust" label="Adjust stock" onPress={() => router.push('/inventory/adjust')} />} />
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
          <StatStrip
            items={[
              { label: 'Products', value: loading || error ? '—' : String(products.length) },
              { label: outOfStockCount ? `Reorder · ${outOfStockCount} out` : 'Reorder', value: loading || error ? '—' : String(reorderCount), tone: 'amber' },
              ...(value.atCost !== null ? [{ label: 'Value at cost', value: loading || error ? '—' : formatMoney(value.atCost), tone: 'blue' as const }] : []),
              { label: 'At selling price', value: loading || error ? '—' : formatMoney(value.atSellingPrice), tone: 'blue' },
            ]}
            note={loading || error ? null : 'Stock values are before GST.'}
          />
          {error ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{error}</Text>
              <ActionButton title="Retry" variant="secondary" onPress={() => void loadInventory()} />
            </View>
          ) : null}
        </View>
        <StickyBar>
          <SearchField accessibilityLabel="Search inventory" value={search} onChangeText={setSearch} placeholder="Search product or unit" />
          <ChipRow label="Filter stock" options={(['All', 'Low stock', 'Out of stock'] as const).map((value) => ({ key: value, label: value, selected: filter === value, onPress: () => setFilter(value) }))} />
        </StickyBar>
        <View style={styles.listCard}>
          {loading ? <ActivityIndicator color="#176B50" style={styles.stateMessage} /> : null}
          {!loading && !error && filteredStockItems.length === 0 ? (
            <Text style={styles.stateMessage}>{search || filter !== 'All' ? 'No items match these filters.' : 'No active products yet. Add a product from your catalog to get started.'}</Text>
          ) : null}
          {filteredStockItems.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={() => router.push(`/product/${item.id}`)} style={styles.row}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {formatQuantity(item.quantity, item.unit)} available / min {formatQuantity(item.minimumStock, item.unit)}
                </Text>
              </View>
              <View style={[styles.badge, item.quantity <= 0 ? styles.danger : item.quantity < item.minimumStock ? styles.warning : styles.safe]}>
                <Text style={styles.badgeText}>
                  {item.quantity <= 0 ? 'Out' : item.quantity < item.minimumStock ? 'Low' : 'Healthy'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  notice: { backgroundColor: '#E9F9F1', color: '#0F766E', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  errorState: {
    gap: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#A74737',
    fontSize: 13,
  },
  stateMessage: {
    color: '#737B77',
    fontSize: 13,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#24332A',
  },
  meta: {
    marginTop: 4,
    color: '#737B77',
    fontSize: 12,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  safe: {
    backgroundColor: '#E7F2ED',
  },
  warning: {
    backgroundColor: '#FFF4D7',
  },
  danger: {
    backgroundColor: '#FBECEA',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#24332A',
  },
});
