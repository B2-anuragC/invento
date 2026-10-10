import { RecordPaymentModal } from '@/components/record-payment-modal';
import { TransactionReceipt } from '@/components/transaction-receipt';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, AppScreen, ListCard, formatUnitLabel } from '@/components/invento-ui';
import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { appSession, fetchPricingAccess, fetchProduct, fetchPurchase, type PurchaseRecord } from '@/services/api';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export default function PurchaseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [purchase, setPurchase] = useState<PurchaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [canRecordPayment, setCanRecordPayment] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    setPurchase(null);
    const session = appSession.current;
    if (!session || !id) {
      setError('Sign in to view this purchase.');
      setLoading(false);
      return;
    }
    void fetchPricingAccess(session).then((access) => { if (active) setCanRecordPayment(access.role === 'OWNER' || access.role === 'ADMIN'); }).catch(() => { if (active) setCanRecordPayment(false); });
    fetchPurchase(session, id).then(async (record) => {
      const missingIds = [...new Set(record.items.filter((item) => !item.product?.name).map((item) => item.productId))];
      const products = await Promise.all(missingIds.map(async (productId) => {
        try { return await fetchProduct(session, productId); } catch { return null; }
      }));
      const byId = new Map(products.filter((product) => product !== null).map((product) => [product.id, product]));
      if (active) setPurchase({ ...record, items: record.items.map((item) => ({ ...item, product: item.product?.name ? item.product : byId.get(item.productId) })) });
    })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load this purchase.'); })
      .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    // Retry recreates the focus effect to reload this purchase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retry]));

    if (!loading && !error && purchase) {
    return <><TransactionReceipt data={{ id: purchase.id, kind: 'purchase', date: purchase.purchaseDate, invoice: purchase.invoiceNumber, contact: purchase.supplier.name, total: purchase.total, subtotal: purchase.subtotal, taxTotal: purchase.taxTotal, amountPaid: purchase.amountPaid, dueDate: purchase.dueDate, payments: purchase.payments, note: purchase.note, items: purchase.items.map((item) => ({ id: item.id, name: item.product?.name ?? 'Product unavailable', sku: item.product?.sku, quantity: Number(item.quantity), gstRate: item.gstRate, taxAmount: item.taxAmount, lineTotal: item.lineTotal, label: formatUnitLabel(item.product?.unit ?? 'PIECE'), price: item.purchasePrice == null ? undefined : Number(item.purchasePrice) })) }} onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/activity')} onNew={() => router.push('/purchase/create')} onPayment={canRecordPayment && purchase.total != null ? () => setPaymentOpen(true) : undefined} />{paymentOpen && purchase.total != null ? <RecordPaymentModal kind="purchase" id={purchase.id} total={purchase.total} amountPaid={purchase.amountPaid} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); setRetry((value) => value + 1); }} /> : null}</>;
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[screenStyles.content, { paddingBottom: 36 + insets.bottom }]}>
        <ScreenHeading title="Purchase details" subtitle={purchase?.invoiceNumber || (purchase ? `Purchase ${purchase.id.slice(-8).toUpperCase()}` : 'Invoice and items sold')} />
        {loading ? <ActivityIndicator color="#176B50" /> : error ? (
          <View style={styles.section}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><ActionButton title="Try again" onPress={() => setRetry((value) => value + 1)} /></View>
        ) : purchase ? (
          <View style={styles.section}>
            <ListCard title="Invoice summary">
              <Text style={styles.name}>{purchase.supplier?.name ?? 'Customer'}</Text>
              <Text style={styles.meta}>{new Date(purchase.purchaseDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              {purchase.note ? <Text style={styles.meta}>Note · {purchase.note}</Text> : null}
            </ListCard>
            <ListCard title={`Items received · ${purchase.items.length} line items`}>
              {purchase.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{item.product?.name ?? 'Product unavailable'}</Text>
                    {item.product?.sku ? <Text style={styles.meta}>{item.product.sku}</Text> : null}
                    <Text style={styles.meta}>{Number(item.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.product ? formatUnitLabel(item.product.unit) : 'units'} × {item.purchasePrice == null ? 'Restricted price' : money(Number(item.purchasePrice))}</Text>
                  </View>
                  <Text style={styles.amount}>{item.purchasePrice == null ? 'Restricted' : money(Number(item.quantity) * Number(item.purchasePrice))}</Text>
                </View>
              ))}
              <View style={styles.total}><Text style={styles.name}>Purchase total</Text><Text style={styles.amount}>{purchase.total == null ? 'Restricted' : money(Number(purchase.total))}</Text></View>
            </ListCard>
            <ActionButton title="New purchase" onPress={() => router.push(`/purchase/create?supplierId=${encodeURIComponent(purchase.supplier.id)}`)} />
          </View>
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  name: { color: '#24332A', fontSize: 15, fontWeight: '700' },
  meta: { color: '#737B77', fontSize: 12, lineHeight: 19, marginTop: 5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E2E2' },
  copy: { flex: 1, minWidth: 0 },
  amount: { color: '#176B50', fontSize: 15, fontWeight: '800' },
  total: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 20 },
  error: { color: '#A74737', fontSize: 14 },
});
