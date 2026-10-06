import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, appColors, formatUnitLabel } from '@/components/invento-ui';
import { appSession, fetchInventory, fetchProducts, fetchSales, type InventoryRecord, type ProductRecord, type SaleRecord } from '@/services/api';

type StockFilter = 'all' | 'low' | 'out';
type ProductSection = 'frequent' | 'recent' | 'favorites';

const sectionLabels: Record<ProductSection, string> = {
  frequent: 'Frequently used',
  recent: 'Recent',
  favorites: 'Favorites',
};

export default function ProductsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryRecord>>({});
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState<ProductSection>('frequent');
  const [category, setCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [unitFilter, setUnitFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [sortByPrice, setSortByPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [salesError, setSalesError] = useState('');

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
          setCategory((current) => current !== 'All' && !productData.some((item) => item.category?.trim() === current) ? 'All' : current);
          setUnitFilter((current) => current !== 'All' && !productData.some((item) => item.unit === current) ? 'All' : current);
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

      void fetchSales(session)
        .then((saleData) => { if (active) { setSales(saleData); setSalesError(''); } })
        .catch((salesLoadError: unknown) => {
          if (active) setSalesError(salesLoadError instanceof Error ? salesLoadError.message : 'Could not load product activity.');
        });

      return () => { active = false; };
    }, [status]),
  );

  const categories = useMemo(
    () => ['All', ...new Set(products.map((item) => item.category?.trim()).filter((value): value is string => Boolean(value)))],
    [products],
  );
  const salesFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    sales.forEach((sale) => sale.items.forEach((item) => {
      counts[item.productId] = (counts[item.productId] ?? 0) + 1;
    }));
    return counts;
  }, [sales]);
  const units = useMemo(
    () => ['All', ...new Set(products.map((product) => product.unit))],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = products.filter((item) => {
      const matchesSearch = !query ||
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query);
      const quantity = Number(inventory[item.id]?.quantity ?? 0);
      const lowStock = quantity < Number(item.minimumStock);
      const matchesStock = stockFilter === 'all' ||
        (stockFilter === 'low' && lowStock && quantity > 0) ||
        (stockFilter === 'out' && quantity <= 0);
      return matchesSearch && (category === 'All' || item.category?.trim() === category) &&
        (unitFilter === 'All' || item.unit === unitFilter) && matchesStock &&
        (section !== 'favorites' || favorites[item.id]);
    });

    return result.sort((left, right) => {
      if (sortByPrice) return Number(left.sellingPrice) - Number(right.sellingPrice);
      if (section === 'frequent') return (salesFrequency[right.id] ?? 0) - (salesFrequency[left.id] ?? 0) || left.name.localeCompare(right.name);
      if (section === 'recent') return right.updatedAt.localeCompare(left.updatedAt);
      return left.name.localeCompare(right.name);
    });
  }, [category, favorites, inventory, products, salesFrequency, search, section, sortByPrice, stockFilter, unitFilter]);

  const lowStockCount = products.filter((product) => {
    const quantity = Number(inventory[product.id]?.quantity ?? 0);
    return quantity > 0 && quantity < Number(product.minimumStock);
  }).length;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Catalog</Text>
            <Text style={styles.subtitle}>{products.length} PRODUCTS · {Math.max(0, categories.length - 1)} CATEGORIES</Text>
          </View>
          <Pressable onPress={() => router.push('/product/new')} style={styles.addIcon} accessibilityLabel="Add product">
            <Text style={styles.addIconText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search products"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder="Search products, SKU or barcode"
            placeholderTextColor="#89918C"
            autoCapitalize="none"
          />
          {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setSearch('')}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {categories.map((value) => (
            <Pressable key={value} onPress={() => setCategory(value)} style={[styles.categoryChip, category === value && styles.categoryChipSelected]}>
              <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{value}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.actionsRow}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((value) => !value)} style={styles.filterButton}>
            <Text style={styles.filterButtonText}>☷  {showFilters ? 'Hide filters' : 'Search filters'}</Text>
          </Pressable>
          <Pressable onPress={() => setSortByPrice((value) => !value)} style={styles.sortButton}>
            <Text style={styles.sortText}>{sortByPrice ? 'Price ↑' : 'Default sort'}</Text>
          </Pressable>
        </View>

        {showFilters ? (
          <View style={styles.filtersPanel}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Search filters</Text>
              <Pressable accessibilityRole="button" onPress={() => { setSearch(''); setCategory('All'); setStockFilter('all'); setUnitFilter('All'); setStatus('ACTIVE'); setSortByPrice(false); setSection('frequent'); }}><Text style={styles.linkText}>Reset all</Text></Pressable>
            </View>
            <Text style={styles.filterLabel}>Stock status</Text>
            <View style={styles.filterChoices}>
              {([
                ['all', 'All stock'],
                ['low', `Low (${lowStockCount})`],
                ['out', 'Out of stock'],
              ] as [StockFilter, string][]).map(([value, label]) => (
                <Pressable key={value} onPress={() => setStockFilter(value)} style={[styles.filterChoice, stockFilter === value && styles.filterChoiceSelected]}>
                  <Text style={[styles.filterChoiceText, stockFilter === value && styles.filterChoiceTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.filterLabel}>Unit</Text>
            <View style={styles.filterChoices}>
              {units.map((value) => (
                <Pressable key={value} onPress={() => setUnitFilter(value)} style={[styles.filterChoice, unitFilter === value && styles.filterChoiceSelected]}>
                  <Text style={[styles.filterChoiceText, unitFilter === value && styles.filterChoiceTextSelected]}>{value === 'All' ? value : formatUnitLabel(value)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Catalog status</Text>
              <View style={styles.statusToggle}>
                {(['ACTIVE', 'INACTIVE'] as const).map((value) => (
                  <Pressable key={value} onPress={() => setStatus(value)} style={[styles.statusOption, status === value && styles.statusOptionSelected]}>
                    <Text style={[styles.statusText, status === value && styles.statusTextSelected]}>{value === 'ACTIVE' ? 'Active' : 'Inactive'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.viewBar}>
          <View style={styles.viewCopy}>
            <Text style={styles.viewTitle}>Customer view</Text>
            <Text style={styles.viewHint}>Selling rates and stock visible</Text>
          </View>
        </View>

        <View style={styles.sectionTabs}>
          {(Object.keys(sectionLabels) as ProductSection[]).map((value) => (
            <Pressable key={value} onPress={() => setSection(value)} style={[styles.sectionTab, section === value && styles.sectionTabSelected]}>
              <Text style={[styles.sectionTabText, section === value && styles.sectionTabTextSelected]}>{sectionLabels[value]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.listHeading}>
          <View>
            <Text style={styles.listTitle}>{search ? 'Search results' : section === 'favorites' ? 'Saved items' : 'Your counter essentials'}</Text>
            <Text style={styles.listSubtitle}>{filteredProducts.length} items · stock and price at a glance</Text>
          </View>
          <Pressable onPress={() => setSection('recent')}><Text style={styles.linkText}>View all</Text></Pressable>
        </View>

        {loading ? <ActivityIndicator color={appColors.primary} style={styles.stateMessage} /> : null}
        {!loading && error ? <Text style={styles.errorMessage}>{error}</Text> : null}
        {salesError ? <Text style={styles.activityMessage}>{salesError}</Text> : null}
        {!loading && !error && filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{section === 'favorites' && !search ? 'No favorites yet' : search ? 'No results found' : 'No products here yet'}</Text>
            <Text style={styles.emptyCopy}>
              {search ? 'Try another name, SKU, barcode or category.' : 'Add products to your catalog to start managing stock.'}
            </Text>
            {!search && section !== 'favorites' ? <ActionButton title="Add product" onPress={() => router.push('/product/new')} /> : null}
          </View>
        ) : null}
        {!loading && !error ? filteredProducts.map((product) => {
          const quantity = Number(inventory[product.id]?.quantity ?? 0);
          const low = quantity < Number(product.minimumStock);
          return (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.cardTop}>
                <Pressable style={styles.productMain} onPress={() => router.push(`/product/${product.id}`)}>
                  <View style={styles.productIcon}><Text style={styles.productIconText}>◇</Text></View>
                  <View style={styles.productTitleWrap}>
                    <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
                    <Text numberOfLines={1} style={styles.productMeta}>{product.category || 'Uncategorized'} · {product.sku}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={favorites[product.id] ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
                  onPress={() => setFavorites((current) => ({ ...current, [product.id]: !current[product.id] }))}
                  style={styles.favoriteButton}>
                  <Text style={[styles.favoriteText, favorites[product.id] && styles.favoriteSelected]}>{favorites[product.id] ? '♥' : '♡'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => router.push(`/product/${product.id}`)}>
                <View style={styles.productFacts}>
                  <View style={styles.stockFact}>
                    <Text style={[styles.stockValue, low && styles.stockLow]}>{quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {formatUnitLabel(product.unit)}</Text>
                    <Text style={styles.factLabel}>{quantity <= 0 ? 'Out of stock' : low ? 'Below minimum' : 'Available'}</Text>
                  </View>
                  <View style={styles.priceFact}>
                    <Text style={styles.factLabel}>SELL / {formatUnitLabel(product.unit)}</Text>
                    <Text style={styles.sellValue}>{formatMoney(Number(product.sellingPrice))}</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        }) : null}
      </ScrollView>
    </AppScreen>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 90, marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 16, backgroundColor: '#FFFFFF' },
  eyebrow: { color: '#557267', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#1D2B25', fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 5, color: '#737B77', fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  addIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  addIconText: { color: '#24332A', fontSize: 28, lineHeight: 32, fontWeight: '400' },
  viewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'transparent', borderRadius: 0, padding: 0 },
  viewCopy: { flex: 1, marginRight: 10 },
  viewTitle: { color: '#24332A', fontSize: 14, fontWeight: '800' },
  viewHint: { color: '#737B77', fontSize: 12, marginTop: 3 },
  viewSwitch: { flexDirection: 'row', padding: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 999 },
  viewOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  viewOptionSelected: { backgroundColor: '#176B50' },
  viewOptionText: { color: '#737B77', fontSize: 11, fontWeight: '700' },
  viewOptionTextSelected: { color: '#FFFFFF' },
  viewDescription: { color: '#737B77', fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 17 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E1E1E1', borderWidth: 1, borderRadius: 13, minHeight: 52, paddingHorizontal: 14, marginBottom: 15 },
  searchIcon: { color: '#68766E', fontSize: 26, marginRight: 9 },
  searchInput: { flex: 1, color: '#17241E', fontSize: 14, paddingVertical: 13 },
  clearSearch: { color: '#738078', fontSize: 22, paddingLeft: 8 },
  categoryList: { gap: 8, paddingBottom: 14 },
  categoryChip: { borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 },
  categoryChipSelected: { borderColor: '#176B50', backgroundColor: '#176B50' },
  categoryText: { color: '#737B77', fontSize: 12, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  filterButton: { backgroundColor: '#FFFFFF', borderColor: '#DDE4DE', borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, minHeight: 46, justifyContent: 'center' },
  filterButtonText: { color: '#283830', fontSize: 11, fontWeight: '700' },
  sortButton: { paddingHorizontal: 3 },
  sortText: { color: '#69766F', fontSize: 12, fontWeight: '600' },
  filtersPanel: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E7E1', padding: 13, marginBottom: 12 },
  filterLabel: { color: '#6A766F', fontSize: 11, fontWeight: '700' },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginBottom: 12 },
  filterChoice: { borderWidth: 1, borderColor: '#DDE4DE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterChoiceSelected: { backgroundColor: '#E8F2EC', borderColor: '#9ABCA8' },
  filterChoiceText: { color: '#58665E', fontSize: 11, fontWeight: '600' },
  filterChoiceTextSelected: { color: '#07543F' },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusToggle: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: '#F1F4F1' },
  statusOption: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  statusOptionSelected: { backgroundColor: '#FFFFFF' },
  statusText: { color: '#68746E', fontSize: 10, fontWeight: '600' },
  statusTextSelected: { color: '#17241E' },
  sectionTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#DDE4DE', gap: 22, marginTop: 8, marginBottom: 18 },
  sectionTab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  sectionTabSelected: { borderBottomColor: '#0C7253' },
  sectionTabText: { color: '#6A766F', fontSize: 12, fontWeight: '600' },
  sectionTabTextSelected: { color: '#0C7253', fontWeight: '800' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listTitle: { color: '#1B2921', fontSize: 19, fontWeight: '800' },
  listSubtitle: { color: '#78837C', fontSize: 11, marginTop: 4 },
  linkText: { color: '#176B50', fontSize: 12, fontWeight: '700' },
  stateMessage: { marginVertical: 22 },
  errorMessage: { color: '#A74737', padding: 12, backgroundColor: '#F6E9E6', borderRadius: 12 },
  activityMessage: { color: '#96621B', fontSize: 11, marginBottom: 8 },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8E3', alignItems: 'center', padding: 24, gap: 9 },
  emptyTitle: { color: '#1B2921', fontSize: 17, fontWeight: '800' },
  emptyCopy: { color: '#748078', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 6 },
  productCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 18, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  productMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  productIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F4F1', alignItems: 'center', justifyContent: 'center' },
  productIconText: { color: '#52665A', fontSize: 24 },
  productTitleWrap: { flex: 1, minWidth: 0, marginLeft: 11 },
  productName: { color: '#1E2D24', fontSize: 15, fontWeight: '800' },
  productMeta: { color: '#758078', fontSize: 11, marginTop: 4 },
  favoriteButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  favoriteText: { color: '#8B9890', fontSize: 22 },
  favoriteSelected: { color: '#B5534A' },
  productFacts: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 15, paddingTop: 0, borderTopWidth: 0 },
  stockFact: { flex: 1.1, minWidth: 0 },
  priceFact: { flex: 1, minWidth: 0 },
  stockValue: { color: '#176B50', fontSize: 13, fontWeight: '800' },
  stockLow: { color: '#A74737' },
  factLabel: { color: '#849088', fontSize: 9, fontWeight: '700', marginBottom: 5 },
  priceValue: { color: '#2D3B33', fontSize: 13, fontWeight: '800' },
  sellValue: { color: '#176B50', fontSize: 13, fontWeight: '800' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFF2EF' },
  soldLabel: { flex: 1, color: '#849088', fontSize: 10, marginRight: 8 },
  quickAdd: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#E8F2EC', borderRadius: 9 },
  quickAddText: { color: '#176B50', fontSize: 10, fontWeight: '800' },
});
