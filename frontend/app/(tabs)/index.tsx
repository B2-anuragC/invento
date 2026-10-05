import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, appColors } from '@/components/invento-ui';
import {
  appSession,
  fetchDashboardSummary,
  fetchPricingAccess,
  fetchPurchases,
  fetchSales,
  type DashboardSummary,
  type PurchaseRecord,
  type SaleRecord,
} from '@/services/api';

type RecentTransaction =
  | { id: string; kind: 'Sale'; name: string; date: string; itemCount: number; total: number; route: '/(tabs)/sales' }
  | { id: string; kind: 'Purchase'; name: string; date: string; itemCount: number; total: number | null; route: '/(tabs)/purchases' };

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '₹0';
  return `₹${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    const session = appSession.current;
    if (!session) {
      setSummary(null);
      setTransactions([]);
      setError('Sign in to view your business overview.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [dashboard, sales, access] = await Promise.all([
        fetchDashboardSummary(session),
        fetchSales(session),
        fetchPricingAccess(session),
      ]);
      if (requestId.current !== currentRequestId) return;
      const purchases = access.role === 'OWNER' || access.role === 'ADMIN'
        ? await fetchPurchases(session)
        : [];
      if (requestId.current !== currentRequestId) return;
      setSummary(dashboard);
      setTransactions([
        ...sales.map((sale: SaleRecord): RecentTransaction => ({
          id: sale.id,
          kind: 'Sale',
          name: sale.customer.name,
          date: sale.saleDate,
          itemCount: sale.items.length,
          total: Number(sale.total),
          route: '/(tabs)/sales',
        })),
        ...purchases.map((purchase: PurchaseRecord): RecentTransaction => ({
          id: purchase.id,
          kind: 'Purchase',
          name: purchase.supplier.name,
          date: purchase.purchaseDate,
          itemCount: purchase.items.length,
          total: purchase.total == null ? null : Number(purchase.total),
          route: '/(tabs)/purchases',
        })),
      ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 2));
    } catch (loadError: unknown) {
      if (requestId.current === currentRequestId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load your business overview.');
      }
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      return () => { requestId.current += 1; };
    }, [loadDashboard]),
  );

  const lowStockCount = summary?.lowStockCount ?? 0;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.storeName}>{appSession.current?.businessName ?? 'Your shop'}</Text>
          </View>
          <Pressable accessibilityLabel="Account" onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
            <Text style={styles.avatarText}>{appSession.current?.user.name.slice(0, 1).toUpperCase() ?? 'I'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadDashboard()}><Text style={styles.retry}>Retry</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.salesCard}>
          <View style={styles.salesTop}>
            <Text style={styles.salesLabel}>TODAY’S SALES</Text>
            <Pressable accessibilityLabel="View activity" onPress={() => router.push('/activity')}>
              <Text style={styles.arrow}>↗</Text>
            </Pressable>
          </View>
          <View style={styles.salesValueRow}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.salesValue}>
              {loading ? '—' : formatMoney(summary?.todaySales)}
            </Text>
            <Text style={styles.salesCount}>{summary?.saleCount ?? 0} sales</Text>
          </View>
          <View style={styles.salesDivider} />
          <View style={styles.salesDetails}>
            <View style={styles.salesDetail}>
              <Text style={styles.salesDetailLabel}>Purchases today</Text>
              <Text style={styles.salesDetailValue}>
                {loading ? '—' : summary?.todayPurchases == null ? 'Hidden' : formatMoney(summary.todayPurchases)}
              </Text>
            </View>
            <View style={styles.salesDetail}>
              <Text style={styles.salesDetailLabel}>Products in catalog</Text>
              <Text style={styles.salesDetailValue}>{loading ? '—' : summary?.productCount ?? 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={() => router.push('/sale/create')} style={styles.primaryAction}>
            <Text style={styles.actionPlus}>＋</Text><Text style={styles.primaryActionText}>New sale</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/purchase/create')} style={styles.secondaryAction}>
            <Text style={styles.purchaseArrow}>↙</Text><Text style={styles.secondaryActionText}>New purchase</Text>
          </Pressable>
        </View>

        {lowStockCount > 0 ? (
          <Pressable onPress={() => router.push('/(tabs)/inventory')} style={styles.stockAlert}>
            <Text style={styles.alertIcon}>⚠</Text>
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>{lowStockCount} products need attention</Text>
              <Text style={styles.alertSub}>Low stock · review stock levels</Text>
            </View>
            <Text style={styles.alertArrow}>›</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.push('/(tabs)/products')} style={styles.catalogLink}>
          <View style={styles.catalogIcon}><Text style={styles.catalogGlyph}>▣</Text></View>
          <View style={styles.catalogCopy}>
            <Text style={styles.catalogTitle}>Find your next item</Text>
            <Text style={styles.catalogSubtitle}>
              {summary ? `${summary.productCount} products in your catalog` : 'Search products and check stock'}
            </Text>
          </View>
          <Text style={styles.catalogArrow}>→</Text>
        </Pressable>

        <View style={styles.activityHeading}>
          <Text style={styles.activityTitle}>Recent activity</Text>
          <Pressable onPress={() => router.push('/activity')}><Text style={styles.activityLink}>View all</Text></Pressable>
        </View>
        <View style={styles.activityCard}>
          {loading ? <ActivityIndicator color={appColors.primary} style={styles.loading} /> : null}
          {!loading && !error && transactions.length === 0 ? (
            <Text style={styles.emptyActivity}>Your saved sales and purchases will appear here.</Text>
          ) : null}
          {transactions.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.route)}
              style={[styles.activityRow, index < transactions.length - 1 && styles.activityRowBorder]}>
              <Text style={[styles.transactionIcon, item.kind === 'Sale' ? styles.saleIcon : styles.purchaseIcon]}>
                {item.kind === 'Sale' ? '↗' : '↙'}
              </Text>
              <View style={styles.activityCopy}>
                <Text numberOfLines={1} style={styles.activityName}>{item.name}</Text>
                <Text style={styles.activityMeta}>
                  {item.kind} · {item.itemCount} item{item.itemCount === 1 ? '' : 's'} · {new Date(item.date).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={[styles.activityAmount, item.kind === 'Purchase' && styles.purchaseAmount]}>
                {item.total == null ? 'Hidden' : `${item.kind === 'Sale' ? '+' : ''}${formatMoney(item.total)}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 28, backgroundColor: '#F5F5F5' },
  header: { minHeight: 82, marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { color: '#737B77', fontSize: 13 },
  storeName: { marginTop: 3, fontSize: 22, fontWeight: '800', color: '#1D2B25' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#176B50', fontSize: 16, fontWeight: '800' },
  errorCard: { marginTop: 14, borderRadius: 12, padding: 13, backgroundColor: '#FBECEA', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  errorText: { flex: 1, color: '#A74737', fontSize: 12 },
  retry: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  salesCard: { marginTop: 16, padding: 19, borderRadius: 20, backgroundColor: '#104C38' },
  salesTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  salesLabel: { color: '#D7E5DD', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  arrow: { color: '#D7E5DD', fontSize: 22, fontWeight: '700' },
  salesValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 17 },
  salesValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', flexShrink: 1 },
  salesCount: { color: '#D7E5DD', fontSize: 12 },
  salesDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.24)', marginVertical: 16 },
  salesDetails: { flexDirection: 'row', gap: 16 },
  salesDetail: { flex: 1 },
  salesDetailLabel: { color: '#D7E5DD', fontSize: 12 },
  salesDetailValue: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryAction: { flex: 1, minHeight: 54, borderRadius: 13, backgroundColor: '#176B50', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryAction: { flex: 1, minHeight: 54, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionPlus: { color: '#FFFFFF', fontSize: 21, fontWeight: '500' },
  purchaseArrow: { color: '#176B50', fontSize: 20, fontWeight: '700' },
  primaryActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryActionText: { color: '#176B50', fontSize: 14, fontWeight: '700' },
  stockAlert: { minHeight: 66, marginTop: 14, paddingHorizontal: 15, borderRadius: 14, backgroundColor: '#FFF5D8', flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertIcon: { color: '#946316', fontSize: 20 },
  alertCopy: { flex: 1 },
  alertTitle: { color: '#795A24', fontSize: 14, fontWeight: '700' },
  alertSub: { color: '#8D7349', fontSize: 11, marginTop: 3 },
  alertArrow: { color: '#946316', fontSize: 25 },
  catalogLink: { minHeight: 78, marginTop: 14, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E1E1E1', flexDirection: 'row', alignItems: 'center', gap: 12 },
  catalogIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  catalogGlyph: { color: '#176B50', fontSize: 24 },
  catalogCopy: { flex: 1 },
  catalogTitle: { color: '#24332A', fontSize: 15, fontWeight: '700' },
  catalogSubtitle: { color: '#737B77', fontSize: 12, marginTop: 3 },
  catalogArrow: { color: '#176B50', fontSize: 24 },
  activityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  activityTitle: { color: '#24332A', fontSize: 17, fontWeight: '800' },
  activityLink: { color: '#176B50', fontSize: 13, fontWeight: '700' },
  activityCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E1E1E1' },
  loading: { paddingVertical: 16 },
  emptyActivity: { color: '#737B77', fontSize: 12, paddingVertical: 18, textAlign: 'center' },
  activityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E2E2E2' },
  transactionIcon: { width: 26, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  saleIcon: { color: '#176B50' },
  purchaseIcon: { color: '#26372F' },
  activityCopy: { flex: 1, minWidth: 0 },
  activityName: { color: '#24332A', fontSize: 13, fontWeight: '700' },
  activityMeta: { color: '#737B77', fontSize: 10, marginTop: 4 },
  activityAmount: { color: '#176B50', fontSize: 13, fontWeight: '700' },
  purchaseAmount: { color: '#26372F' },
});
