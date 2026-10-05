import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

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
    }, []),
  );

  const restrictedPrice = purchases.some((purchase) => purchase.total == null);
  const totalPurchases = purchases.reduce((total, purchase) => total + Number(purchase.total ?? 0), 0);
  const supplierCount = new Set(purchases.map((purchase) => purchase.supplier?.id)).size;

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Purchases</Text>
        <Text style={styles.subtitle}>Stock replenishment and supplier invoices</Text>

        <SectionHeader title="Overview" />
        <View style={styles.cardsRow}>
          <SummaryCard label="Total value" value={restrictedPrice ? 'Hidden' : formatMoney(totalPurchases)} delta={restrictedPrice ? 'Restricted by access settings' : 'All recorded purchases'} accent="amber" />
          <SummaryCard label="Suppliers" value={String(supplierCount)} delta="In purchase history" accent="blue" />
        </View>

        <View style={styles.buttonRow}>
          <ActionButton title="Add purchase" onPress={() => router.push('/purchase/create')} />
        </View>

        <ListCard title="Recent purchases">
          {loading ? (
            <ActivityIndicator color="#1F9D68" />
          ) : error ? (
            <Text style={styles.message}>{error}</Text>
          ) : purchases.length ? (
            purchases.map((purchase) => (
              <View key={purchase.id} style={styles.row}>
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
                <Text style={styles.amount}>{purchase.total == null ? 'Restricted' : formatMoney(Number(purchase.total))}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.message}>No purchases yet. Record an invoice to replenish stock.</Text>
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
  purchaseDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  poId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  supplier: {
    marginTop: 4,
    color: '#374151',
    fontSize: 12,
  },
  date: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 11,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  message: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },
});
