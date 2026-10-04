import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  AppScreen,
  ListCard,
  SectionHeader,
  SummaryCard,
  cardShadow,
} from '@/components/invento-ui';
import { appSession, fetchDashboardSummary, type DashboardSummary } from '@/services/api';

function formatMoney(value: string | number | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '₹0';
  }
  return `₹${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadSummary = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    const session = appSession.current;

    if (!session) {
      setSummary(null);
      setError('Sign in to view your business dashboard.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const data = await fetchDashboardSummary(session);
      if (requestId.current === currentRequestId) setSummary(data);
    } catch (loadError: unknown) {
      if (requestId.current === currentRequestId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the dashboard.');
      }
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
      return () => { requestId.current += 1; };
    }, [loadSummary]),
  );

  const summaryItems = [
    {
      label: 'Sales today',
      value: summary ? formatMoney(summary.todaySales) : '—',
      delta: summary ? `${summary.saleCount} sales completed` : loading ? 'Loading…' : error ? 'Unavailable' : 'No data',
      accent: 'green' as const,
    },
    {
      label: 'Purchases',
      value: summary ? formatMoney(summary.todayPurchases) : '—',
      delta: summary ? `${summary.purchaseCount} purchase entries` : loading ? 'Loading…' : error ? 'Unavailable' : 'No data',
      accent: 'amber' as const,
    },
    {
      label: 'Products',
      value: summary ? String(summary.productCount) : '—',
      delta: summary ? `${summary.lowStockCount} low stock` : loading ? 'Loading…' : error ? 'Unavailable' : 'No data',
      accent: 'blue' as const,
    },
    {
      label: 'Low stock',
      value: summary ? String(summary.lowStockCount) : '—',
      delta: summary ? 'Need reorder' : loading ? 'Loading…' : error ? 'Unavailable' : 'No data',
      accent: 'red' as const,
    },
  ];
  const activity = summary?.recentTransactions.slice(0, 3) ?? [];

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.storeName}>{appSession.current?.businessName ?? 'Your shop'}</Text>
          </View>
          <View style={[styles.badge, cardShadow, error ? styles.badgeUnavailable : null]}>
            <Text style={[styles.badgeText, error ? styles.badgeUnavailableText : null]}>
              {loading ? 'Loading' : error ? 'Unavailable' : 'Live'}
            </Text>
          </View>
        </View>

        <SectionHeader title="Overview" />
        {error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <ActionButton title="Retry" variant="secondary" onPress={() => void loadSummary()} />
          </View>
        ) : null}
        {loading ? <ActivityIndicator color="#1F9D68" style={styles.loadingIndicator} /> : null}
        <View style={styles.grid}>
          {summaryItems.map((item) => (
            <SummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              delta={item.delta}
              accent={item.accent}
            />
          ))}
        </View>

        <View style={styles.actionsRow}>
          <ActionButton title="New sale" onPress={() => router.push('/sale/create')} />
          <ActionButton title="Add purchase" variant="secondary" onPress={() => router.push('/purchase/create')} />
        </View>

        <ListCard title="Recent activity">
          {!loading && !error && activity.length === 0 ? (
            <Text style={styles.emptyActivity}>No recent activity yet.</Text>
          ) : null}
          {activity.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityTextWrap}>
                <Text style={styles.activityTitle}>{item.product?.name ?? 'Inventory update'}</Text>
                <Text style={styles.activityDetail}>
                  {item.type} · {new Date(item.createdAt).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.activityAmount}>
                {item.quantity}{item.product?.unit ? ` ${item.product.unit}` : ''}
              </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  storeName: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#E9F9F1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 12,
  },
  badgeUnavailable: {
    backgroundColor: '#FEECEC',
  },
  badgeUnavailableText: {
    color: '#B91C1C',
  },
  errorState: {
    gap: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  loadingIndicator: {
    marginBottom: 16,
  },
  emptyActivity: {
    color: '#6B7280',
    fontSize: 13,
    paddingVertical: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  activityDetail: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  activityAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
});
