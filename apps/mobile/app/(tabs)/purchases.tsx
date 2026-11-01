import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { HeaderIconButton, ListHeader, SearchField, StatStrip, StickyBar, screenStyles } from '@/components/screen-heading';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen } from '@/components/invento-ui';
import { appSession, fetchPurchases, type PurchaseRecord } from '@/services/api';
import { formatDateTime, formatMoney } from '@/services/format';
import { transactionSearchText, transactionTitle } from '@/services/transaction-labels';
import { countedAmount, netAmount } from '@/services/transaction-accounting';
import { returnSummary } from '@/services/bill-returns';


export default function PurchasesScreen() {
  const router = useRouter();
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      const session = appSession.current;
      let active = true;

      if (!session) {
        setError('Sign in to view purchases for your business.');
        setLoading(false);
        return () => {
          active = false;
        };
      }

      setLoading(true);
      setError('');
      fetchPurchases(session)
        .then((data) => {
          if (active) setPurchases(data);
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load purchases.');
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

  const restrictedPrice = purchases.some((purchase) => purchase.total == null);
  // Net of returns; cancelled bills count nothing.
  const totalPurchases = purchases.reduce((total, purchase) => total + countedAmount(purchase), 0);
  const supplierCount = new Set(purchases.map((purchase) => purchase.supplier?.id).filter(Boolean)).size;

  const filteredRecords = purchases.filter((record) =>
    transactionSearchText({ ...record, name: record.supplier?.name }).includes(search.trim().toLowerCase()),
  ).sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={screenStyles.listContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets stickyHeaderIndices={[1]}>
        <View>
          <ListHeader title="Purchases" actions={<HeaderIconButton permission="purchases.create" variant="primary" icon="add" text="Add purchase" label="Add purchase" onPress={() => router.push('/purchase/create')} />} />
          <StatStrip
            items={[
              { label: restrictedPrice ? 'Total · restricted' : purchases.some((record) => record.syncState) ? 'Total · incl. pending' : 'Total value', value: loading || error ? '—' : restrictedPrice ? 'Hidden' : formatMoney(totalPurchases), tone: 'amber' },
              { label: 'Purchases', value: loading || error ? '—' : String(purchases.length), tone: 'blue' },
              { label: 'Suppliers', value: loading || error ? '—' : String(supplierCount), tone: 'blue' },
            ]}
          />
        </View>
        <StickyBar>
          <SearchField accessibilityLabel="Search purchases" value={search} onChangeText={setSearch} placeholder="Search invoice or supplier" />
        </StickyBar>
        <View style={styles.listCard}>
          {search ? <Text style={styles.resultCount}>Search results · {filteredRecords.length}</Text> : null}
          {loading ? (
            <ActivityIndicator color="#176B50" />
          ) : error ? (
            <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.message}>{error}</Text><ActionButton title="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} /></View>
          ) : filteredRecords.length ? (
            filteredRecords.map((purchase) => (
              <Pressable key={purchase.id} accessibilityRole="button" accessibilityLabel="View purchase details" onPress={() => router.push(`/purchase/${purchase.id}`)} style={styles.row}>
                <View style={styles.purchaseDetails}>
                  <Text style={styles.poId}>
                    {transactionTitle('purchase', purchase)}
                  </Text>
                  <Text style={styles.supplier}>{purchase.supplier?.name ?? 'Supplier'}</Text>
                  {purchase.status === 'CANCELLED' ? <Text style={styles.cancelledLabel}>Cancelled</Text> : null}
                  {returnSummary(purchase) ? <Text style={styles.returnedLabel}>{returnSummary(purchase)}</Text> : null}
                  <Text style={styles.date}>
                    {purchase.syncState ? `${purchase.syncState === 'conflict' ? 'Needs attention' : 'Pending sync'} · ` : ''}{formatDateTime(purchase.purchaseDate)}
                    {' · '}{purchase.items.length} item{purchase.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={styles.amount}>{purchase.total == null ? 'Restricted' : formatMoney(netAmount(purchase) ?? 0)} ›</Text>
              </Pressable>
            ))
          ) : (
            <View style={{ paddingVertical: 24, gap: 8 }}><Text style={{ color: '#24332A', fontSize: 17, fontWeight: '700' }}>{search ? 'No matching invoices' : 'Your first purchase starts here'}</Text><Text style={styles.message}>{search ? 'Try a different invoice number or supplier name.' : 'No purchases yet. Record an invoice to replenish stock.'}</Text></View>
          )}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  resultCount: { color: '#737B77', fontSize: 12, fontWeight: '700', paddingTop: 12 },
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
  purchaseDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  poId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#24332A',
  },
  supplier: {
    marginTop: 4,
    color: '#43554B',
    fontSize: 12,
  },
  date: {
    marginTop: 4,
    color: '#737B77',
    fontSize: 11,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  message: {
    color: '#737B77',
    fontSize: 13,
    lineHeight: 19,
  },
});
