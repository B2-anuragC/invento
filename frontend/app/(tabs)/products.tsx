import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ActionButton,
  AppScreen,
  ProductRow,
  SectionHeader,
  SummaryCard,
  cardShadow,
} from '@/components/invento-ui';
import { appSession, fetchInventory, fetchProducts, type InventoryRecord, type ProductRecord } from '@/services/api';

export default function ProductsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      const session = appSession.current;
      let active = true;
      if (!session) {
        setProducts([]);
        setInventory({});
        setError('Sign in to view products for your business.');
        setLoading(false);
        return () => { active = false; };
      }

      setLoading(true);
      setError('');
      Promise.all([fetchProducts(session, { status }), fetchInventory(session)])
        .then(([productData, inventoryData]) => {
          if (!active) return;
          setProducts(productData);
          setInventory(inventoryData.reduce<Record<string, InventoryRecord>>((balances, item) => {
            balances[item.productId] = item;
            return balances;
          }, {}));
        })
        .catch((loadError: unknown) => {
          if (!active) return;
          setProducts([]);
          setInventory({});
          setError(loadError instanceof Error ? loadError.message : 'Could not load products.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => { active = false; };
    }, [status]),
  );

  const filteredProducts = useMemo(
    () => products.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode?.toLowerCase().includes(search.toLowerCase()),
    ),
    [products, search],
  );
  const lowStockCount = products.filter((product) =>
    Number(inventory[product.id]?.quantity ?? 0) < Number(product.minimumStock),
  ).length;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Products</Text>
            <Text style={styles.subtitle}>Catalog and current stock</Text>
          </View>
          <View style={[styles.headerBadge, cardShadow]}>
            <Text style={styles.headerBadgeText}>{products.length} {status === 'ACTIVE' ? 'active' : 'inactive'}</Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="Search product or SKU"
          placeholderTextColor="#9CA3AF"
        />

        <SectionHeader title="Stock status" />
        <View style={styles.quickStats}>
          <SummaryCard label="Products" value={String(products.length)} delta={`${status.toLowerCase()} catalog`} accent="blue" />
          <SummaryCard label="Low stock" value={String(lowStockCount)} delta="Below minimum" accent="amber" />
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.statusSwitch}>
            {(['ACTIVE', 'INACTIVE'] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setStatus(value)}
                style={[styles.statusOption, status === value && styles.statusOptionSelected]}>
                <Text style={[styles.statusText, status === value && styles.statusTextSelected]}>
                  {value === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Text>
              </Pressable>
            ))}
          </View>
          <ActionButton title="Add product" onPress={() => router.push('/product/new')} />
        </View>

        <View style={styles.listSection}>
          {loading ? <ActivityIndicator color="#1F9D68" style={styles.stateMessage} /> : null}
          {!loading && error ? <Text style={styles.stateMessage}>{error}</Text> : null}
          {!loading && !error && filteredProducts.length === 0 ? (
            <Text style={styles.stateMessage}>{search ? 'No matching products.' : 'No products here yet.'}</Text>
          ) : null}
          {!loading && filteredProducts.map((item) => {
            const quantity = Number(inventory[item.id]?.quantity ?? 0);
            return (
            <ProductRow
              key={item.id}
              name={item.name}
              sku={item.sku}
              stock={quantity}
              unit={item.unit}
              price={`₹${Number(item.sellingPrice).toLocaleString('en-IN')}`}
              lowStock={quantity < Number(item.minimumStock)}
              onPress={() => router.push(`/product/${item.id}`)}
            />
            );
          })}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  headerBadge: {
    backgroundColor: '#E9F9F1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 11,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    fontSize: 15,
    color: '#111827',
  },
  quickStats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  statusSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
  },
  statusOption: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusOptionSelected: {
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextSelected: {
    color: '#111827',
  },
  listSection: {
    marginTop: 8,
  },
  stateMessage: {
    marginVertical: 20,
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
});
