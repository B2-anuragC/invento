import { RecordPaymentModal } from '@/components/record-payment-modal';
import { TransactionReceipt } from '@/components/transaction-receipt';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, AppScreen, ListCard, formatUnitLabel } from '@/components/invento-ui';
import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { appSession, fetchPricingAccess, fetchProduct, fetchSale, type SaleRecord } from '@/services/api';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export default function SaleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [canRecordPayment, setCanRecordPayment] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSale(null);
    const session = appSession.current;
    if (!session || !id) {
      setError('Sign in to view this sale.');
      setLoading(false);
      return;
    }
    void fetchPricingAccess(session).then((access) => { if (active) setCanRecordPayment(access.role === 'OWNER' || access.role === 'ADMIN'); }).catch(() => { if (active) setCanRecordPayment(false); });
    fetchSale(session, id).then(async (record) => {
      const missingIds = [...new Set(record.items.filter((item) => !item.product?.name).map((item) => item.productId))];
      const products = await Promise.all(missingIds.map(async (productId) => {
        try { return await fetchProduct(session, productId); } catch { return null; }
      }));
      const byId = new Map(products.filter((product) => product !== null).map((product) => [product.id, product]));
      if (active) setSale({ ...record, items: record.items.map((item) => ({ ...item, product: item.product?.name ? item.product : byId.get(item.productId) })) });
    })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load this sale.'); })
      .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    // Retry recreates the focus effect to reload this sale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retry]));

    if (!loading && !error && sale) {
    return <><TransactionReceipt data={{ id: sale.id, kind: 'sale', date: sale.saleDate, invoice: sale.invoiceNumber, contact: sale.customer.name, total: sale.total, subtotal: sale.subtotal, taxTotal: sale.taxTotal, amountPaid: sale.amountPaid, dueDate: sale.dueDate, payments: sale.payments, paymentMethod: sale.paymentMethod, note: sale.note, items: sale.items.map((item) => ({ id: item.id, name: item.product?.name ?? 'Product unavailable', sku: item.product?.sku, quantity: Number(item.quantity), gstRate: item.gstRate, taxAmount: item.taxAmount, lineTotal: item.lineTotal, label: item.optionName ?? formatUnitLabel(item.unit ?? item.product?.unit ?? 'PIECE'), price: item.sellingPrice == null ? undefined : Number(item.sellingPrice) })) }} onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/activity')} onNew={() => router.push('/sale/create')} onRepeat={() => router.push(`/sale/create?saleId=${encodeURIComponent(sale.id)}`)} onPayment={canRecordPayment && sale.total != null ? () => setPaymentOpen(true) : undefined} />{paymentOpen && sale.total != null ? <RecordPaymentModal kind="sale" id={sale.id} total={sale.total} amountPaid={sale.amountPaid} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); setRetry((value) => value + 1); }} /> : null}</>;
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[screenStyles.content, { paddingBottom: 36 + insets.bottom }]}>
        <ScreenHeading title="Sale details" subtitle={sale?.invoiceNumber || (sale ? `Sale ${sale.id.slice(-8).toUpperCase()}` : 'Invoice and items sold')} />
        {loading ? <ActivityIndicator color="#176B50" /> : error ? (
          <View style={styles.section}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><ActionButton title="Try again" onPress={() => setRetry((value) => value + 1)} /></View>
        ) : sale ? (
          <View style={styles.section}>
            <ListCard title="Invoice summary">
              <Text style={styles.name}>{sale.customer?.name ?? 'Customer'}</Text>
              <Text style={styles.meta}>{new Date(sale.saleDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              <Text style={styles.meta}>Payment method · {sale.paymentMethod.replaceAll('_', ' ')}</Text>
              {sale.note ? <Text style={styles.meta}>Note · {sale.note}</Text> : null}
            </ListCard>
            <ListCard title={`Items sold · ${sale.items.length} line items`}>
              {sale.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{item.product?.name ?? 'Product unavailable'}</Text>
                    {item.product?.sku ? <Text style={styles.meta}>{item.product.sku}</Text> : null}
                    <Text style={styles.meta}>{Number(item.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.product ? item.optionName ?? formatUnitLabel(item.unit ?? item.product.unit) : 'units'} × {money(Number(item.sellingPrice))}</Text>
                  </View>
                  <Text style={styles.amount}>{money(Number(item.quantity) * Number(item.sellingPrice))}</Text>
                </View>
              ))}
              <View style={styles.total}><Text style={styles.name}>Sale total</Text><Text style={styles.amount}>{money(Number(sale.total))}</Text></View>
            </ListCard>
            <ActionButton title="Repeat this sale" onPress={() => router.push(`/sale/create?saleId=${encodeURIComponent(sale.id)}`)} />
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
