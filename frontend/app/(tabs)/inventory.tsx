import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, ListCard, SectionHeader, SummaryCard } from '@/components/invento-ui';
import { appSession, fetchInventory, fetchProducts, type InventoryRecord, type ProductRecord } from '@/services/api';

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  minimumStock: number;
  unit: string;
};

export default function InventoryScreen() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryRecord>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.unit.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const leftRisk = left.quantity <= 0 ? 0 : left.quantity < left.minimumStock ? 1 : 2;
      const rightRisk = right.quantity <= 0 ? 0 : right.quantity < right.minimumStock ? 1 : 2;
      if (leftRisk !== rightRisk) return leftRisk - rightRisk;
      return left.name.localeCompare(right.name);
    });

  const outOfStockCount = stockItems.filter((item) => item.quantity <= 0).length;
  const reorderCount = stockItems.filter((item) => item.quantity <= 0 || item.quantity < item.minimumStock).length;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>Current stock health and reorder risk</Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="Search product or stock risk"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />

        <SectionHeader title="Health" />
        <View style={styles.cardsRow}>
          <SummaryCard
            label="Products"
            value={loading || error ? '—' : String(products.length)}
            delta={loading ? 'Loading…' : error ? 'Unavailable' : 'Active catalog'}
            accent="green"
          />
          <SummaryCard
            label="Need reorder"
            value={loading || error ? '—' : String(reorderCount)}
            delta={loading ? 'Loading…' : error ? 'Unavailable' : `${outOfStockCount} out of stock`}
            accent="amber"
          />
        </View>

        {error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <ActionButton title="Retry" variant="secondary" onPress={() => void loadInventory()} />
          </View>
        ) : null}

        <ListCard title="Stock levels">
          {loading ? <ActivityIndicator color="#1F9D68" style={styles.stateMessage} /> : null}
          {!loading && !error && filteredStockItems.length === 0 ? (
            <Text style={styles.stateMessage}>{search ? 'No matching inventory items.' : 'No active products yet.'}</Text>
          ) : null}
          {filteredStockItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit.toLowerCase()} available / min {item.minimumStock}
                </Text>
              </View>
              <View style={[styles.badge, item.quantity <= 0 ? styles.danger : item.quantity < item.minimumStock ? styles.warning : styles.safe]}>
                <Text style={styles.badgeText}>
                  {item.quantity <= 0 ? 'Out' : item.quantity < item.minimumStock ? 'Low' : 'Healthy'}
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 32,
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
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    fontSize: 15,
    color: '#111827',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  errorState: {
    gap: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  stateMessage: {
    color: '#6B7280',
    fontSize: 13,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  safe: {
    backgroundColor: '#E9F9F1',
  },
  warning: {
    backgroundColor: '#FFF4D7',
  },
  danger: {
    backgroundColor: '#FEECEC',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#111827',
  },
});
