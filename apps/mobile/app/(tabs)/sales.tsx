import { usePermissions } from '@/services/permissions';
import { paymentBalance, isOverdue, countedAmount, netAmount } from '@/services/transaction-accounting';
import { returnSummary } from '@/services/bill-returns';
import { pendingPaymentsCard } from '@/services/pending-payments';
import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { ChipRow, HeaderIconButton, ListHeader, SearchField, StatStrip, StickyBar, screenStyles } from '@/components/screen-heading';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen } from '@/components/invento-ui';
import { appSession, fetchSales, type SaleRecord } from '@/services/api';
import { formatDateTime, formatMoney } from '@/services/format';
import { transactionSearchText, transactionTitle } from '@/services/transaction-labels';


export default function SalesScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const params = useLocalSearchParams<{ payment?: string }>();
  // The filter lives in the address, so "Payments to collect" on Overview always opens it switched on.
  const pendingOnly = params.payment === 'pending';
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
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
    }, [retry, sync.syncing]),
  );

  // Net of returns; cancelled bills count nothing.
  const totalSales = sales.reduce((total, sale) => total + countedAmount(sale), 0);

  const pendingCard = pendingPaymentsCard(sales, { ready: !loading && !error, filterOn: pendingOnly });
  const filteredRecords = sales.filter((record) => (!pendingOnly || (paymentBalance(record) ?? 0) > 0)).filter((record) =>
    transactionSearchText({ ...record, name: record.customer?.name }).includes(search.trim().toLowerCase()),
  ).sort((left, right) => right.saleDate.localeCompare(left.saleDate));

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={screenStyles.listContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets stickyHeaderIndices={[1]}>
        <View>
          <ListHeader title="Sales" actions={<HeaderIconButton permission="sales.create" variant="primary" icon="add" text="New sale" label="New sale" onPress={() => router.push('/sale/quick')} />} />
          <StatStrip
            items={[
              { label: sales.some((record) => record.syncState) ? 'Total · incl. pending' : 'Total value', value: loading || error ? '—' : formatMoney(totalSales) },
              { label: 'Sales', value: loading || error ? '—' : String(sales.length), tone: 'blue' },
              { label: 'To collect', value: pendingCard.amount, tone: 'amber' },
            ]}
            note={[pendingCard.detail, pendingCard.note].filter(Boolean).join(' · ')}
          />
        </View>
        <StickyBar>
          <SearchField accessibilityLabel="Search sales" value={search} onChangeText={setSearch} placeholder="Search invoice or customer" />
          {pendingCard.showFilter ? <ChipRow label="Filter sales" options={[
            { key: 'all', label: 'All sales', selected: !pendingOnly, onPress: () => router.setParams({ payment: 'all' }) },
            { key: 'pending', label: pendingCard.chipLabel, accessibilityLabel: `${pendingCard.filterLabel}. ${pendingCard.accessibilityLabel}`, selected: pendingOnly, onPress: () => router.setParams({ payment: pendingOnly ? 'all' : 'pending' }) },
          ]} /> : null}
        </StickyBar>
        <View style={styles.listCard}>
          {search ? <Text style={styles.resultCount}>Search results · {filteredRecords.length}</Text> : null}
          {loading ? (
            <ActivityIndicator color="#176B50" />
          ) : error ? (
            <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.message}>{error}</Text><ActionButton title="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} /></View>
          ) : filteredRecords.length ? (
            filteredRecords.map((sale) => (
              <View key={sale.id} style={styles.row}>
                <View style={styles.saleDetails}>
                  <Pressable accessibilityRole="button" accessibilityLabel="View sale details" onPress={() => router.push(`/sale/${sale.id}`)}><Text style={styles.saleId}>{transactionTitle('sale', sale)}</Text><Text style={styles.repeatText}>View details ›</Text></Pressable>
                  <Text style={styles.customer}>{sale.customer?.name ?? 'Customer'}</Text>
                  {sale.status === 'CANCELLED' ? <Text style={styles.cancelledLabel}>Cancelled</Text> : null}
                  {returnSummary(sale) ? <Text style={styles.returnedLabel}>{returnSummary(sale)}</Text> : null}
                  {sale.syncState ? <Text style={styles.repeatText}>{sale.syncState === 'conflict' ? 'Needs attention · Saved on device' : 'Pending sync · Saved on device'}</Text> : null}
                  {(paymentBalance(sale) ?? 0) > 0 ? <Text style={styles.pendingLabel}>To collect {formatMoney(paymentBalance(sale)!)}{isOverdue(sale) ? ' · Overdue' : ''}{sale.syncState ? ' · Pending confirmation' : ''}</Text> : null}
                  <Text style={styles.time}>
                    {formatDateTime(sale.saleDate)}
                    {' · '}{sale.items.length} item{sale.items.length === 1 ? '' : 's'}
                  </Text>
                  <Pressable onPress={() => router.push(`/sale/create?saleId=${encodeURIComponent(sale.id)}`)} style={[styles.repeatButton, !can('sales.create') && { display: 'none' }]}>
                    <Text style={styles.repeatText}>Repeat sale</Text>
                  </Pressable>
                </View>
                <Text style={styles.amount}>{formatMoney(netAmount(sale) ?? 0)}</Text>
              </View>
            ))
          ) : (
            <View style={{ paddingVertical: 24, gap: 8 }}><Text style={{ color: '#24332A', fontSize: 17, fontWeight: '700' }}>{search ? 'No matching invoices' : 'Your first sale starts here'}</Text><Text style={styles.message}>{search ? 'Try a different invoice number or customer name.' : 'No sales yet. Record your first sale to see it here.'}</Text></View>
          )}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  resultCount: { color: '#737B77', fontSize: 12, fontWeight: '700', paddingTop: 12 },
  pendingLabel: { color: '#795A24', fontSize: 12, fontWeight: '700', marginTop: 4 },
  cancelledLabel: { color: '#A74737', fontSize: 12, fontWeight: '700', marginTop: 4 },
  returnedLabel: { color: '#9C5B12', fontSize: 12, fontWeight: '700', marginTop: 4 },
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
