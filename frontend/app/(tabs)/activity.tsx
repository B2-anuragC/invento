import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, appColors } from '@/components/invento-ui';
import { appSession, fetchPricingAccess, fetchPurchases, fetchSales, type PurchaseRecord, type SaleRecord } from '@/services/api';

type ActivityFilter = 'All' | 'Sale' | 'Purchase';
type DateFilter = 'All dates' | 'Today' | 'This month';
type ActivityItem =
  | { id: string; type: 'Sale'; name: string; invoice: string; date: string; total: number; items: number; payment: string; route: '/(tabs)/sales' }
  | { id: string; type: 'Purchase'; name: string; invoice: string; date: string; total: number | null; items: number; route: '/(tabs)/purchases' };

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

export default function ActivityScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<ActivityItem[]>([]);
  const [purchaseHistoryRestricted, setPurchaseHistoryRestricted] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('All dates');
  const [search, setSearch] = useState('');
  const [dateFilterVisible, setDateFilterVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActivity = useCallback(() => {
    const session = appSession.current;
    if (!session) {
      setTransactions([]);
      setError('Sign in to view business activity.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchSales(session), fetchPricingAccess(session)])
      .then(async ([sales, access]) => {
        const canViewPurchases = access.role === 'OWNER' || access.role === 'ADMIN';
        const purchases = canViewPurchases ? await fetchPurchases(session) : [];
        setPurchaseHistoryRestricted(!canViewPurchases);
        setTransactions([
          ...sales.map((sale: SaleRecord): ActivityItem => ({
            id: sale.id,
            type: 'Sale',
            name: sale.customer.name,
            invoice: sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`,
            date: sale.saleDate,
            total: Number(sale.total),
            items: sale.items.length,
            payment: sale.paymentMethod.replaceAll('_', ' '),
            route: '/(tabs)/sales',
          })),
          ...purchases.map((purchase: PurchaseRecord): ActivityItem => ({
            id: purchase.id,
            type: 'Purchase',
            name: purchase.supplier.name,
            invoice: purchase.invoiceNumber || `Purchase ${purchase.id.slice(-8).toUpperCase()}`,
            date: purchase.purchaseDate,
            total: purchase.total == null ? null : Number(purchase.total),
            items: purchase.items.length,
            route: '/(tabs)/purchases',
          })),
        ].sort((left, right) => right.date.localeCompare(left.date)));
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load business activity.');
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { loadActivity(); }, [loadActivity]));

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const today = new Date();
    return transactions.filter((item) =>
      (filter === 'All' || item.type === filter) &&
      (!query || `${item.name} ${item.invoice} ${item.type}`.toLowerCase().includes(query)) &&
      (dateFilter === 'All dates' ||
        (dateFilter === 'Today' && new Date(item.date).toDateString() === today.toDateString()) ||
        (dateFilter === 'This month' && new Date(item.date).getMonth() === today.getMonth() &&
          new Date(item.date).getFullYear() === today.getFullYear())),
    );
  }, [dateFilter, filter, search, transactions]);

  const visibleSales = visibleTransactions.filter((item) => item.type === 'Sale');
  const visiblePurchases = visibleTransactions.filter((item) => item.type === 'Purchase');
  const salesTotal = visibleSales.reduce((sum, item) => sum + item.total, 0);
  const hiddenPurchaseTotal = purchaseHistoryRestricted || visiblePurchases.some((item) => item.total == null);
  const purchaseTotal = visiblePurchases.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Activity</Text>
          <Text style={styles.subtitle}>TRANSACTIONS · {today.toUpperCase()}</Text>
        </View>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Transaction, customer or supplier"
            placeholderTextColor="#7A817E"
            style={styles.search}
          />
        </View>
        <View style={styles.filters}>
          {(['All', 'Sale', 'Purchase'] as ActivityFilter[]).map((value) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{value === 'Sale' ? 'Sale' : value === 'Purchase' ? 'Purchase' : 'All'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dateFilters}>
          <Pressable onPress={() => setDateFilterVisible(true)} style={styles.dateChip}>
            <Text style={styles.dateChipText}>▦  {dateFilter}  ⌄</Text>
          </Pressable>
          <View style={styles.dateChip}><Text style={styles.dateChipText}>✓  Saved</Text></View>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryHeading}>Shown saved transactions · {visibleTransactions.length}</Text>
          <View style={styles.summaryValues}>
            <View style={styles.summaryValueBlock}>
              <Text style={styles.summaryLabel}>Sale total</Text>
              <Text style={styles.summaryAmount}>{formatMoney(salesTotal)}</Text>
            </View>
            <View style={styles.summaryValueBlock}>
              <Text style={styles.summaryLabel}>Purchase total</Text>
              <Text style={styles.summaryAmount}>{hiddenPurchaseTotal ? 'Hidden' : formatMoney(purchaseTotal)}</Text>
            </View>
          </View>
        </View>
        {loading ? <ActivityIndicator color={appColors.primary} style={styles.loading} /> : null}
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadActivity}><Text style={styles.retry}>Retry</Text></Pressable>
          </View>
        ) : null}
        {!loading && !error && visibleTransactions.length === 0 ? (
          <Text style={styles.empty}>{search ? 'No transactions match your search.' : 'Saved sales and purchases will appear here.'}</Text>
        ) : null}
        {!loading && !error && visibleTransactions.length > 0 ? (
          <Text style={styles.sectionHeading}>Saved · {today}</Text>
        ) : null}
        {visibleTransactions.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(item.route)} style={styles.transactionCard}>
            <View style={styles.transactionHeading}>
              <Text style={[styles.transactionIcon, item.type === 'Sale' ? styles.saleIcon : styles.purchaseIcon]}>
                {item.type === 'Sale' ? '↗' : '↙'}
              </Text>
              <View style={styles.transactionCopy}>
                <Text numberOfLines={1} style={styles.personName}>{item.name}</Text>
                <Text style={styles.transactionMeta}>{item.type} · {item.invoice}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.total, item.type === 'Purchase' && styles.purchaseTotal]}>
                {item.total == null ? 'Hidden' : formatMoney(item.total)}
              </Text>
              <Text style={styles.saved}>Saved</Text>
            </View>
            <Text style={styles.detail}>
              {item.items} item{item.items === 1 ? '' : 's'} · {item.type === 'Sale' ? item.payment : new Date(item.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
            <Text style={styles.date}>{new Date(item.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={dateFilterVisible} transparent animationType="fade" onRequestClose={() => setDateFilterVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDateFilterVisible(false)}>
          <View style={styles.dateMenu}>
            {(['All dates', 'Today', 'This month'] as DateFilter[]).map((value) => (
              <Pressable key={value} onPress={() => { setDateFilter(value); setDateFilterVisible(false); }} style={styles.dateOption}>
                <Text style={[styles.dateOptionText, dateFilter === value && styles.dateOptionSelected]}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: '#F5F5F5' },
  header: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, backgroundColor: '#FFFFFF' },
  title: { color: '#1D2B25', fontSize: 29, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 12, marginTop: 5, letterSpacing: 0.2 },
  searchWrap: { minHeight: 52, marginTop: 16, borderRadius: 13, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  searchIcon: { color: '#747C78', fontSize: 24, marginRight: 9 },
  search: { flex: 1, color: '#24332A', fontSize: 14, paddingVertical: 12 },
  filters: { flexDirection: 'row', gap: 9, marginTop: 14 },
  filter: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 17, borderRadius: 12, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF' },
  filterSelected: { backgroundColor: '#176B50', borderColor: '#176B50' },
  filterText: { color: '#747C78', fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  dateFilters: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dateChip: { minHeight: 43, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF' },
  dateChipText: { color: '#747C78', fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20, 31, 25, 0.35)', padding: 24 },
  dateMenu: { width: '100%', maxWidth: 340, borderRadius: 15, paddingHorizontal: 15, backgroundColor: '#FFFFFF' },
  dateOption: { minHeight: 50, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  dateOptionText: { color: '#24332A', fontSize: 14 },
  dateOptionSelected: { color: '#176B50', fontWeight: '800' },
  summaryCard: { marginTop: 15, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E1E1E1', padding: 15 },
  summaryHeading: { color: '#25332C', fontSize: 13, fontWeight: '700' },
  summaryValues: { flexDirection: 'row', gap: 14, marginTop: 13 },
  summaryValueBlock: { flex: 1 },
  summaryLabel: { color: '#737B77', fontSize: 11 },
  summaryAmount: { color: '#24332A', fontSize: 19, fontWeight: '800', marginTop: 5 },
  loading: { marginVertical: 24 },
  errorCard: { backgroundColor: '#FBECEA', borderRadius: 12, padding: 13, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  errorText: { flex: 1, color: '#A74737', fontSize: 12 },
  retry: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  empty: { marginTop: 15, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 14, color: '#737B77', textAlign: 'center', fontSize: 13 },
  sectionHeading: { color: '#24332A', fontSize: 17, fontWeight: '800', marginTop: 21, marginBottom: 11 },
  transactionCard: { marginBottom: 12, padding: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 16 },
  transactionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transactionIcon: { width: 28, fontSize: 22, textAlign: 'center' },
  saleIcon: { color: '#176B50' },
  purchaseIcon: { color: '#24332A' },
  transactionCopy: { flex: 1, minWidth: 0 },
  personName: { color: '#24332A', fontSize: 15, fontWeight: '800' },
  transactionMeta: { color: '#737B77', fontSize: 11, marginTop: 4 },
  chevron: { color: '#176B50', fontSize: 24 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 },
  total: { color: '#176B50', fontSize: 21, fontWeight: '800' },
  purchaseTotal: { color: '#24332A' },
  saved: { color: '#176B50', fontSize: 10, fontWeight: '700', backgroundColor: '#E7F2ED', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  detail: { color: '#737B77', fontSize: 11, marginTop: 6 },
  date: { color: '#737B77', fontSize: 10, marginTop: 8 },
});
