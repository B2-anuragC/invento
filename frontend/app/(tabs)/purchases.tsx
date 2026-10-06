import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, ListCard, SectionHeader, SummaryCard } from '@/components/invento-ui';
import { appSession, fetchPurchases, type PurchaseRecord } from '@/services/api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PurchasesScreen() {
  const router = useRouter();
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
    }, [retry]),
  );

  const restrictedPrice = purchases.some((purchase) => purchase.total == null);
  const totalPurchases = purchases.reduce((total, purchase) => total + Number(purchase.total ?? 0), 0);
  const supplierCount = new Set(purchases.map((purchase) => purchase.supplier?.id).filter(Boolean)).size;

  const filteredRecords = purchases.filter((record) =>
    [record.invoiceNumber, record.id, record.supplier?.name].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())),
  ).sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[styles.content, screenStyles.content]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeading title="Purchases" subtitle="Stock replenishment and supplier invoices" />

        <SectionHeader title="Overview" />
        <View style={styles.cardsRow}>
          <SummaryCard label="Total value" value={loading || error ? '—' : restrictedPrice ? 'Hidden' : formatMoney(totalPurchases)} delta={restrictedPrice ? 'Restricted by access settings' : 'All recorded purchases'} accent="amber" />
          <SummaryCard label="Suppliers" value={loading || error ? '—' : String(supplierCount)} delta="In purchase history" accent="blue" />
        </View>

        <View style={styles.buttonRow}>
          <ActionButton title="Add purchase" onPress={() => router.push('/purchase/create')} />
        </View>

        <TextInput accessibilityLabel="Search purchases" value={search} onChangeText={setSearch} placeholder="Search invoice or supplier" placeholderTextColor="#89918C" style={screenStyles.search} autoCapitalize="none" />
        <ListCard title={search ? `Search results · ${filteredRecords.length}` : 'Purchases history'}>
          {loading ? (
            <ActivityIndicator color="#176B50" />
          ) : error ? (
            <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.message}>{error}</Text><ActionButton title="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} /></View>
          ) : filteredRecords.length ? (
            filteredRecords.map((purchase) => (
              <Pressable key={purchase.id} accessibilityRole="button" accessibilityLabel="View purchase details" onPress={() => router.push(`/purchase/${purchase.id}`)} style={styles.row}>
                <View style={styles.purchaseDetails}>
                  <Text style={styles.poId}>
                    {purchase.invoiceNumber || `Purchase ${purchase.id.slice(-8).toUpperCase()}`}
                  </Text>
                  <Text style={styles.supplier}>{purchase.supplier?.name ?? 'Supplier'}</Text>
                  <Text style={styles.date}>
                    {new Date(purchase.purchaseDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}{purchase.items.length} item{purchase.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={styles.amount}>{purchase.total == null ? 'Restricted' : formatMoney(Number(purchase.total))} ›</Text>
              </Pressable>
            ))
          ) : (
            <View style={{ paddingVertical: 24, gap: 8 }}><Text style={{ color: '#24332A', fontSize: 17, fontWeight: '700' }}>{search ? 'No matching invoices' : 'Your first purchase starts here'}</Text><Text style={styles.message}>{search ? 'Try a different invoice number or supplier name.' : 'No purchases yet. Record an invoice to replenish stock.'}</Text></View>
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
