import { usePermissions } from '@/services/permissions';
import { readProductFavorites, saveProductFavorites } from '@/services/product-favorites';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoredImage } from '@/components/stored-image';
import { fileSource } from '@/services/file-storage';
import { ListingLayout, type ListingView } from '@/components/listing-layout';
import { ProductThumbnail } from '@/components/product-photo';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const { can } = usePermissions();
  const insets = useSafeAreaInsets();
  const openFilters = () => { Keyboard.dismiss(); setShowFilters(true); };
  const resetFilters = () => { setCategory('All'); setStockFilter('all'); setUnitFilter('All'); setStatus('ACTIVE'); setSortByPrice(false); setSection('frequent'); };
  const [listingView, setListingView] = useState<ListingView>('list');
  const isGrid = listingView === 'grid';
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

      void readProductFavorites(session).then((value) => { if (active) setFavorites(value); }).catch(() => { if (active) setError('Could not load favorites.'); });
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
    () => ['All', ...[...new Set(products.map((item) => item.category?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))],
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

  const filterCount = Number(category !== 'All') + Number(stockFilter !== 'all') + Number(unitFilter !== 'All') + Number(status !== 'ACTIVE');

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Catalog</Text>
            <Text style={styles.subtitle}>{products.length} PRODUCTS · {Math.max(0, categories.length - 1)} CATEGORIES</Text>
          </View>
          <Pressable disabled={!can('products.create')} style={[styles.addIcon, !can('products.create') && { display: 'none' }]} onPress={() => router.push('/product/new')} accessibilityLabel="Add product">
            <Text style={styles.addIconText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color="#68766E" />
            <TextInput accessibilityLabel="Search products" value={search} onChangeText={setSearch} style={styles.searchInput} placeholder="Name, SKU or barcode" placeholderTextColor="#89918C" autoCapitalize="none" />
            {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setSearch('')} style={styles.clearButton}><Ionicons name="close" size={19} color="#738078" /></Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Filters and sorting${filterCount ? `, ${filterCount} active filters` : ''}`} accessibilityState={{ expanded: showFilters }} onPress={openFilters} style={[styles.filterButton, filterCount > 0 && styles.filterChoiceSelected]}><Ionicons name="options-outline" size={20} color="#176B50" /><Text style={styles.linkText}>Filters{filterCount ? ` · ${filterCount}` : ''}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList} keyboardShouldPersistTaps="handled">
          {categories.map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Category: ${value}`} accessibilityState={{ selected: category === value }} onPress={() => setCategory(value)} style={[styles.categoryChip, category === value && styles.categoryChipSelected]}>
              <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{value}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.resultsBar}>
          <Text style={styles.resultCount}>{loading ? 'Loading products…' : `${filteredProducts.length} products`}{status === 'INACTIVE' ? ' · Inactive' : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change product grouping and sort" onPress={openFilters} style={styles.browseButton}><Text style={styles.linkText}>{sortByPrice ? 'Price ↑' : section === 'frequent' ? 'Frequent' : sectionLabels[section]}</Text><Ionicons name="chevron-down" size={14} color="#176B50" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={isGrid ? 'Show list view' : 'Show grid view'} onPress={() => setListingView(isGrid ? 'list' : 'grid')} style={styles.viewButton}><Ionicons name={isGrid ? 'list-outline' : 'grid-outline'} size={21} color="#176B50" /></Pressable>
        </View>

        {loading ? <ActivityIndicator color={appColors.primary} style={styles.stateMessage} /> : null}
        {!loading && error ? <Text style={styles.errorMessage}>{error}</Text> : null}
        {salesError ? <Text style={styles.activityMessage}>{salesError}</Text> : null}
        {!loading && !error && filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{section === 'favorites' && !search ? 'No favorites yet' : search || filterCount ? 'No matching products' : 'No products here yet'}</Text>
            <Text style={styles.emptyCopy}>
              {search || filterCount ? 'Try another search or clear your filters.' : section === 'favorites' ? 'Tap the heart on a product to save it here.' : 'Add products to your catalog to start managing stock.'}
            </Text>
            {filterCount ? <ActionButton title="Clear filters" variant="secondary" onPress={resetFilters} /> : null}
            {!search && !filterCount && section !== 'favorites' ? <ActionButton permission="products.create" title="Add product" onPress={() => router.push('/product/new')} /> : null}
          </View>
        ) : null}
        {!loading && !error ? <ListingLayout view={listingView}>{filteredProducts.map((product) => {
          const quantity = Number(inventory[product.id]?.quantity ?? 0);
          const low = quantity < Number(product.minimumStock);
          return (
            <View key={product.id} style={[styles.productCard, isGrid && styles.gridCard]}>
              <View style={[styles.cardTop, isGrid && styles.gridTop]}>
                <Pressable style={[styles.productMain, isGrid && styles.gridMain]} onPress={() => router.push(`/product/${product.id}`)}>
                  <View style={isGrid ? styles.gridIcon : styles.productIcon}>{product.imageThumbnail ? isGrid ? <StoredImage accessibilityLabel={product.name} source={fileSource(product.imageThumbnail)} style={styles.gridPhoto} resizeMode="cover" /> : <ProductThumbnail uri={product.imageThumbnail} size={44} /> : <Text style={styles.productIconText}>◇</Text>}</View>
                  <View style={[styles.productTitleWrap, isGrid && styles.gridTitle]}>
                    <Text numberOfLines={1} style={[styles.productName, isGrid && styles.gridName]}>{product.name}</Text>
                    {!isGrid ? <Text numberOfLines={1} style={styles.productMeta}>{product.category || 'Uncategorized'} · {product.sku}</Text> : null}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={favorites[product.id] ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
                  onPress={() => {
                    const session = appSession.current;
                    if (!session) return;
                    const next = { ...favorites, [product.id]: !favorites[product.id] };
                    setFavorites(next);
                    void saveProductFavorites(session, next).catch(() => setError('Could not save favorites. Please try again.'));
                  }}
                  style={[styles.favoriteButton, isGrid && styles.gridFavorite]}>
                  <Text style={[styles.favoriteText, favorites[product.id] && styles.favoriteSelected]}>{favorites[product.id] ? '♥' : '♡'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => router.push(`/product/${product.id}`)}>
                <View style={[styles.productFacts, isGrid && styles.gridFacts]}>
                  <View style={[styles.stockFact, isGrid && styles.gridFact]}>
                    {isGrid ? <Text style={styles.factLabel}>{quantity <= 0 ? 'Out of stock' : low ? 'Below minimum' : 'Available'}</Text> : null}
                    <Text numberOfLines={isGrid ? 1 : undefined} style={[styles.stockValue, low && styles.stockLow]}>{quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {formatUnitLabel(product.unit)}</Text>
                    {!isGrid ? <Text style={styles.factLabel}>{quantity <= 0 ? 'Out of stock' : low ? 'Below minimum' : 'Available'}</Text> : null}
                  </View>
                  <View style={[styles.priceFact, isGrid && styles.gridFact]}>
                    <Text style={styles.factLabel}>SELL / {formatUnitLabel(product.unit)}</Text>
                    <Text numberOfLines={isGrid ? 1 : undefined} style={styles.sellValue}>{formatMoney(Number(product.sellingPrice))}</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}</ListingLayout> : null}
      </ScrollView>
      <Modal visible={showFilters} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={[styles.sheetBackdrop, { paddingTop: insets.top + 12 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss filters" style={StyleSheet.absoluteFill} onPress={() => setShowFilters(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Filters & sorting</Text><Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setShowFilters(false)} style={styles.viewButton}><Ionicons name="close" size={22} color="#24332A" /></Pressable></View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.filtersPanel}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Refine products</Text>
              <Pressable accessibilityRole="button" onPress={resetFilters}><Text style={styles.linkText}>Reset all</Text></Pressable>
            </View>
            <Text style={styles.filterLabel}>Browse</Text>
            <View style={styles.filterChoices}>{(Object.keys(sectionLabels) as ProductSection[]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }} onPress={() => { setSection(value); setSortByPrice(false); }} style={[styles.filterChoice, section === value && styles.filterChoiceSelected]}><Text style={[styles.filterChoiceText, section === value && styles.filterChoiceTextSelected]}>{sectionLabels[value]}</Text></Pressable>)}</View>
            <Text style={styles.filterLabel}>Sort</Text>
            <View style={styles.filterChoices}>{[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: sortByPrice === value }} onPress={() => setSortByPrice(value)} style={[styles.filterChoice, sortByPrice === value && styles.filterChoiceSelected]}><Text style={[styles.filterChoiceText, sortByPrice === value && styles.filterChoiceTextSelected]}>{value ? 'Price: low to high' : 'Default order'}</Text></Pressable>)}</View>
            <Text style={styles.filterLabel}>Stock status</Text>
            <View style={styles.filterChoices}>
              {([
                ['all', 'All stock'],
                ['low', `Low (${lowStockCount})`],
                ['out', 'Out of stock'],
              ] as [StockFilter, string][]).map(([value, label]) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: stockFilter === value }} onPress={() => setStockFilter(value)} style={[styles.filterChoice, stockFilter === value && styles.filterChoiceSelected]}>
                  <Text style={[styles.filterChoiceText, stockFilter === value && styles.filterChoiceTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.filterLabel}>Unit</Text>
            <View style={styles.filterChoices}>
              {units.map((value) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: unitFilter === value }} onPress={() => setUnitFilter(value)} style={[styles.filterChoice, unitFilter === value && styles.filterChoiceSelected]}>
                  <Text style={[styles.filterChoiceText, unitFilter === value && styles.filterChoiceTextSelected]}>{value === 'All' ? value : formatUnitLabel(value)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Catalog status</Text>
              <View style={styles.statusToggle}>
                {(['ACTIVE', 'INACTIVE'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: status === value }} onPress={() => setStatus(value)} style={[styles.statusOption, status === value && styles.statusOptionSelected]}>
                    <Text style={[styles.statusText, status === value && styles.statusTextSelected]}>{value === 'ACTIVE' ? 'Active' : 'Inactive'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

            </ScrollView>
            <View style={[styles.sheetFooter, { paddingBottom: Math.max(12, insets.bottom) }]}><ActionButton fullWidth title={`Show ${filteredProducts.length} products`} onPress={() => setShowFilters(false)} /></View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  categoryList: { gap: 8, paddingTop: 10, paddingBottom: 2 },
  categoryChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#DDE4DE', borderRadius: 12, backgroundColor: '#FFFFFF' },
  categoryChipSelected: { backgroundColor: '#176B50', borderColor: '#176B50' },
  categoryText: { color: '#68746E', fontSize: 12, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearButton: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resultsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  resultCount: { flex: 1, minWidth: 0, fontSize: 12, color: '#737B77' },
  browseButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, flexShrink: 1 },
  viewButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,31,25,0.4)' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#E0E7E1' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#24332A' },
  sheetFooter: { padding: 12, borderTopWidth: 1, borderColor: '#E0E7E1' },
  gridCard: { flex: 0, width: '100%', aspectRatio: 1, padding: 0, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  gridTop: { flex: 1, minHeight: 0 },
  gridMain: { flexDirection: 'column', alignItems: 'stretch', height: '100%' },
  gridIcon: { width: '100%', height: '100%', backgroundColor: '#F1F4F1', alignItems: 'center', justifyContent: 'center' },
  gridPhoto: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  gridTitle: { position: 'absolute', bottom: 0, left: 0, right: 0, marginLeft: 0, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.92)' },
  gridName: { fontSize: 13, lineHeight: 17 },
  gridFavorite: { position: 'absolute', top: 8, right: 8, borderRadius: 18, backgroundColor: '#FFFFFF' },
  gridFacts: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 0, paddingHorizontal: 8, paddingVertical: 6 },
  gridFact: { flex: 1, minWidth: 0 },

  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 16, backgroundColor: '#FFFFFF' },
  title: { color: '#1D2B25', fontSize: 24, fontWeight: '800' },
  subtitle: { marginTop: 5, color: '#737B77', fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  addIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  addIconText: { color: '#24332A', fontSize: 28, lineHeight: 32, fontWeight: '400' },
  searchWrap: { flex: 1, minWidth: 0, gap: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E1E1E1', borderWidth: 1, borderRadius: 13, minHeight: 48, paddingHorizontal: 10 },
  searchInput: { flex: 1, minWidth: 0, color: '#17241E', fontSize: 14, paddingVertical: 13 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderColor: '#DDE4DE', borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, minHeight: 48, justifyContent: 'center' },
  filtersPanel: { padding: 16, gap: 8 },
  filterLabel: { color: '#6A766F', fontSize: 11, fontWeight: '700' },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginBottom: 12 },
  filterChoice: { maxWidth: '100%', minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#DDE4DE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterChoiceSelected: { backgroundColor: '#E8F2EC', borderColor: '#9ABCA8' },
  filterChoiceText: { color: '#58665E', fontSize: 11, fontWeight: '600' },
  filterChoiceTextSelected: { color: '#07543F' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  statusToggle: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: '#F1F4F1' },
  statusOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  statusOptionSelected: { backgroundColor: '#FFFFFF' },
  statusText: { color: '#68746E', fontSize: 10, fontWeight: '600' },
  statusTextSelected: { color: '#17241E' },
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
  sellValue: { color: '#176B50', fontSize: 13, fontWeight: '800' },
});
