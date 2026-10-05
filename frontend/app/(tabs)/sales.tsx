import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen, ListCard, SectionHeader, SummaryCard } from '@/components/invento-ui';
import { appSession, fetchSales, type SaleRecord } from '@/services/api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function SalesScreen() {
  const router = useRouter();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      const session = appSession.current;
      let active = true;

      if (!session) {
        setError('Sign in to view sales for your business.');
        setLoading(false);
        return () => {
          active = false;
        };
      }

      setLoading(true);
      setError('');
      fetchSales(session)
        .then((data) => {
          if (active) setSales(data);
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load sales.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const totalSales = sales.reduce((total, sale) => total + Number(sale.total), 0);

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sales</Text>
        <Text style={styles.subtitle}>Recorded transactions and payment totals</Text>

        <SectionHeader title="Summary" />
        <View style={styles.cardsRow}>
          <SummaryCard label="Total value" value={formatMoney(totalSales)} delta="All recorded sales" accent="green" />
          <SummaryCard label="Sales" value={String(sales.length)} delta="Transactions" accent="blue" />
        </View>

        <View style={styles.buttonRow}>
          <ActionButton title="New sale" onPress={() => router.push('/sale/create')} />
        </View>

        <ListCard title="Recent sales">
          {loading ? (
            <ActivityIndicator color="#1F9D68" />
          ) : error ? (
            <Text style={styles.message}>{error}</Text>
          ) : sales.length ? (
            sales.map((sale) => (
              <View key={sale.id} style={styles.row}>
                <View style={styles.saleDetails}>
                  <Text style={styles.saleId}>{sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={styles.customer}>{sale.customer?.name ?? 'Customer'}</Text>
                  <Text style={styles.time}>
                    {new Date(sale.saleDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}{sale.items.length} item{sale.items.length === 1 ? '' : 's'}
                  </Text>
                  <Pressable onPress={() => router.push(`/sale/create?saleId=${encodeURIComponent(sale.id)}`)} style={styles.repeatButton}>
                    <Text style={styles.repeatText}>Repeat sale</Text>
                  </Pressable>
                </View>
                <Text style={styles.amount}>{formatMoney(Number(sale.total))}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.message}>No sales yet. Record your first sale to see it here.</Text>
          )}
        </ListCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
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
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  buttonRow: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  saleDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  saleId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  customer: {
    marginTop: 4,
    color: '#374151',
    fontSize: 12,
  },
  time: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 11,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  repeatButton: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: '#E8F2EC',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  repeatText: {
    color: '#176B50',
    fontSize: 10,
    fontWeight: '800',
  },
  message: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },
});
