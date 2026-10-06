import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
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
    // Retry intentionally recreates the focus effect to reload the current screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retry]),
  );

  const totalSales = sales.reduce((total, sale) => total + Number(sale.total), 0);

  const filteredRecords = sales.filter((record) =>
    [record.invoiceNumber, record.id, record.customer?.name].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())),
  ).sort((left, right) => right.saleDate.localeCompare(left.saleDate));

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[styles.content, screenStyles.content]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeading title="Sales" subtitle="Recorded transactions and payment totals" />

        <SectionHeader title="Summary" />
        <View style={styles.cardsRow}>
          <SummaryCard label="Total value" value={loading || error ? '—' : formatMoney(totalSales)} delta="All recorded sales" accent="green" />
          <SummaryCard label="Sales" value={loading || error ? '—' : String(sales.length)} delta="Transactions" accent="blue" />
        </View>

        <View style={styles.buttonRow}>
          <ActionButton title="New sale" onPress={() => router.push('/sale/create')} />
        </View>

        <TextInput accessibilityLabel="Search sales" value={search} onChangeText={setSearch} placeholder="Search invoice or customer" placeholderTextColor="#89918C" style={screenStyles.search} autoCapitalize="none" />
        <ListCard title={search ? `Search results · ${filteredRecords.length}` : 'Sales history'}>
          {loading ? (
            <ActivityIndicator color="#176B50" />
          ) : error ? (
            <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.message}>{error}</Text><ActionButton title="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} /></View>
          ) : filteredRecords.length ? (
            filteredRecords.map((sale) => (
              <View key={sale.id} style={styles.row}>
                <View style={styles.saleDetails}>
                  <Pressable accessibilityRole="button" accessibilityLabel="View sale details" onPress={() => router.push(`/sale/${sale.id}`)}><Text style={styles.saleId}>{sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`}</Text><Text style={styles.repeatText}>View details ›</Text></Pressable>
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
            <View style={{ paddingVertical: 24, gap: 8 }}><Text style={{ color: '#24332A', fontSize: 17, fontWeight: '700' }}>{search ? 'No matching invoices' : 'Your first sale starts here'}</Text><Text style={styles.message}>{search ? 'Try a different invoice number or customer name.' : 'No sales yet. Record your first sale to see it here.'}</Text></View>
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
    color: '#24332A',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 18,
    color: '#737B77',
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  saleDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  saleId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#24332A',
  },
  customer: {
    marginTop: 4,
    color: '#43554B',
    fontSize: 12,
  },
  time: {
    marginTop: 4,
    color: '#737B77',
    fontSize: 11,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#176B50',
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
    color: '#737B77',
    fontSize: 13,
    lineHeight: 19,
  },
});
