import { usePermissions } from '@/services/permissions';
import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, appColors } from '@/components/invento-ui';
import { HeaderIconButton, ListHeader, StatStrip, screenStyles } from '@/components/screen-heading';
import { GuestStrip } from '@/components/guest-strip';
import { formatMoney, formatQuantity, plural } from '@/services/format';
import { lowStockText, purchasesSummary, topProductDays, type LowStockRow, type TopProductRow } from '@/services/dashboard-summary';
import { netAmount } from '@/services/transaction-accounting';
import {
  appSession,
  fetchDashboardSummary,
  fetchLowStock,
  fetchSales,
  fetchTopProducts,
  type DashboardSummary,
  type SaleRecord,
} from '@/services/api';

type RecentTransaction = { syncState?: SaleRecord['syncState']; id: string; kind: 'Sale'; name: string; date: string; itemCount: number; total: number; route: `/sale/${string}` };


export default function DashboardScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
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
      const [dashboard, sales, lowStockRows, topProductRows] = await Promise.all([
        fetchDashboardSummary(session),
        can('sales.view') ? fetchSales(session) : [],
        fetchLowStock(session),
        fetchTopProducts(session),
      ]);
      if (requestId.current !== currentRequestId) return;
      setSummary(dashboard);
      setLowStock(lowStockRows);
      setTopProducts(topProductRows);
      setTransactions([
        ...sales.map((sale: SaleRecord): RecentTransaction => ({
          id: sale.id,
          syncState: sale.syncState,
          kind: 'Sale',
          name: sale.customer.name,
          date: sale.saleDate,
          itemCount: sale.items.length,
          total: netAmount(sale) ?? 0,
          route: `/sale/${sale.id}` as const,
        })),
      ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 2));
    } catch (loadError: unknown) {
      if (requestId.current === currentRequestId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load your business overview.');
      }
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, [can]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      return () => { requestId.current += 1; };
    // Reload the visible overview when a sync cycle completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadDashboard, sync.syncing]),
  );

  const lowStockCount = summary?.lowStockCount ?? 0;
  const purchases = summary ? purchasesSummary(summary) : null;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[screenStyles.listContent, styles.content]}>
        <ListHeader title={appSession.current?.businessName ?? 'Your shop'} titleLines={2} actions={<>
          {can('sales.view') || can('purchases.view') ? <HeaderIconButton icon="time-outline" label="All activity: sales, purchases and drafts" onPress={() => router.push('/(tabs)/activity')} /> : null}
          <HeaderIconButton permission="sales.create" variant="primary" icon="add" text="New sale" label="New sale" onPress={() => router.push('/sale/quick')} />
          <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
            <Text aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" style={styles.avatarText}>{appSession.current?.user.name.slice(0, 1).toUpperCase() ?? 'I'}</Text>
          </Pressable>
        </>} />
        <GuestStrip />

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadDashboard()}><Text style={styles.retry}>Retry</Text></Pressable>
          </View>
        ) : null}

        <StatStrip items={[
          { label: `Today's sales · ${plural(summary?.saleCount ?? 0, 'sale')}`, value: loading ? '—' : formatMoney(summary?.todaySales), onPress: can('sales.view') ? () => router.push('/(tabs)/sales') : undefined, accessibilityLabel: `Today's sales: ${loading ? 'loading' : `${formatMoney(summary?.todaySales)}, ${plural(summary?.saleCount ?? 0, 'sale')}`}. View sales` },
          { label: `Today's purchases${purchases?.detail ? ` · ${purchases.detail}` : ''}`, value: loading || !purchases ? '—' : purchases.value, tone: 'amber', onPress: can('purchases.view') ? () => router.push('/(tabs)/purchases') : undefined, accessibilityLabel: purchases ? `Today's purchases: ${purchases.value}, ${purchases.detail}. View purchases` : "Today's purchases" },
        ]} />

        {!loading && lowStock.length > 0 ? (
          <>
            <View style={styles.activityHeading}>
              <Text style={styles.activityTitle}>Low stock{lowStockCount ? ` · ${lowStockCount}` : ''}</Text>
              {can('inventory.view') ? <Pressable onPress={() => router.push('/(tabs)/inventory')}><Text style={styles.activityLink}>View all</Text></Pressable> : null}
            </View>
            <View style={styles.activityCard}>
              {lowStock.map((item, index) => (
                <Pressable key={item.productId} accessibilityRole="button" accessibilityLabel={`${item.name}: ${lowStockText(item)}`} disabled={!can('products.view')} onPress={() => router.push(`/product/${item.productId}`)} style={[styles.listRow, index < lowStock.length - 1 && styles.activityRowBorder]}>
                  <Text numberOfLines={1} style={[styles.activityName, styles.listName]}>{item.name}</Text>
                  <Text style={[styles.stockText, Number(item.quantity) <= 0 && styles.outText]}>{lowStockText(item)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.activityHeading}>
          <Text style={styles.activityTitle}>Top products</Text>
          <Text style={styles.headingNote}>Last {topProductDays} days</Text>
        </View>
        <View style={styles.activityCard}>
          {loading ? <ActivityIndicator color={appColors.primary} style={styles.loading} /> : null}
          {!loading && !error && topProducts.length === 0 ? <Text style={styles.emptyActivity}>Your best-selling products will appear here.</Text> : null}
          {loading ? null : topProducts.map((item, index) => (
            <Pressable key={item.productId} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${item.name}: ${formatQuantity(item.quantity, item.unit)} sold, ${formatMoney(item.revenue)}`} disabled={!can('products.view')} onPress={() => router.push(`/product/${item.productId}`)} style={[styles.listRow, index < topProducts.length - 1 && styles.activityRowBorder]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.activityCopy}>
                <Text numberOfLines={1} style={styles.activityName}>{item.name}</Text>
                <Text style={styles.activityMeta}>{formatQuantity(item.quantity, item.unit)} sold</Text>
              </View>
              <Text style={styles.activityAmount}>{formatMoney(item.revenue)}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/sales?payment=pending')} style={[styles.pendingShortcut, !can('sales.view') && { display: 'none' }]}>
          <Text style={styles.activityLink}>Payments to collect</Text>
          <Text aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" style={styles.activityLink}>›</Text>
        </Pressable>
        <View style={styles.activityHeading}>
          <Text style={styles.activityTitle}>Recent sales</Text>
          <Pressable onPress={() => router.push('/(tabs)/sales')}><Text style={styles.activityLink}>View all</Text></Pressable>
        </View>
        <View style={styles.activityCard}>
          {loading ? <ActivityIndicator color={appColors.primary} style={styles.loading} /> : null}
          {!loading && !error && transactions.length === 0 ? (
            <Text style={styles.emptyActivity}>Your saved sales will appear here.</Text>
          ) : null}
          {transactions.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.route)}
              style={[styles.activityRow, index < transactions.length - 1 && styles.activityRowBorder]}>
              <Text style={[styles.transactionIcon, styles.saleIcon]}>
                ↗
              </Text>
              <View style={styles.activityCopy}>
                <Text numberOfLines={1} style={styles.activityName}>{item.name}</Text>
                <Text style={styles.activityMeta}>
                  {item.syncState === 'conflict' ? 'Needs attention' : item.syncState ? 'Pending sync' : item.kind} · {item.itemCount} item{item.itemCount === 1 ? '' : 's'} · {new Date(item.date).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.activityAmount}>
                {`+${formatMoney(item.total)}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pendingShortcut: { minHeight: 44, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { backgroundColor: '#F5F5F5' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#176B50', fontSize: 16, fontWeight: '800' },
  errorCard: { marginTop: 14, borderRadius: 12, padding: 13, backgroundColor: '#FBECEA', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  errorText: { flex: 1, color: '#A74737', fontSize: 12 },
  retry: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  headingNote: { color: '#737B77', fontSize: 12 },
  listRow: { minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  listName: { flex: 1, minWidth: 0 },
  stockText: { color: '#96621B', fontSize: 12, fontWeight: '600' },
  outText: { color: '#A74737' },
  rank: { width: 22, color: '#176B50', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  activityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  activityTitle: { color: '#24332A', fontSize: 17, fontWeight: '800' },
  activityLink: { color: '#176B50', fontSize: 13, fontWeight: '700' },
  activityCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E1E1E1' },
  loading: { paddingVertical: 16 },
  emptyActivity: { color: '#737B77', fontSize: 12, paddingVertical: 18, textAlign: 'center' },
  activityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E2E2E2' },
  transactionIcon: { width: 26, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  saleIcon: { color: '#176B50' },
  activityCopy: { flex: 1, minWidth: 0 },
  activityName: { color: '#24332A', fontSize: 13, fontWeight: '700' },
  activityMeta: { color: '#737B77', fontSize: 10, marginTop: 4 },
  activityAmount: { color: '#176B50', fontSize: 13, fontWeight: '700' },
});
