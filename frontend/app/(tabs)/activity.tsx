import { readDraft, clearDraft, type TransactionDraft } from '@/services/transaction-drafts';
import { paymentBalance, isOverdue } from '@/services/transaction-accounting';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, AppScreen } from '@/components/invento-ui';
import { screenStyles } from '@/components/screen-heading';
import { appSession, fetchSales, fetchPurchases, type SaleRecord, type PurchaseRecord } from '@/services/api';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const day = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export default function ActivityScreen() {
  const router = useRouter();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState('All statuses');
  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    const session = appSession.current;
    if (!session) { setLoading(false); setError('Sign in to view activity.'); return; }
    setLoading(true); setError('');
    Promise.all([fetchSales(session), fetchPurchases(session), readDraft(session, 'sale'), readDraft(session, 'purchase')]).then(async ([saleData, purchaseData, saleDraft, purchaseDraft]) => {
      const pending: TransactionDraft[] = [];
      for (const draft of [saleDraft, purchaseDraft]) {
        if (!draft) continue;
        const saved = (draft.kind === 'sale' ? saleData : purchaseData).some((record) => record.requestId === draft.requestId);
        if (saved) await clearDraft(session, draft.kind); else pending.push(draft);
      }
      if (active) { setSales(saleData); setPurchases(purchaseData); setDrafts(pending); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load activity.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Retry intentionally reruns this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]));
  const records = useMemo(() => [
    ...sales.map((record) => ({ id: record.id, kind: 'Sale' as const, name: record.customer.name, date: record.saleDate, total: record.total, invoice: record.invoiceNumber, items: record.items.length, amountPaid: record.amountPaid, dueDate: record.dueDate, note: record.paymentMethod.replaceAll('_', ' ') })),
    ...purchases.map((record) => ({ id: record.id, kind: 'Purchase' as const, name: record.supplier.name, date: record.purchaseDate, total: record.total, invoice: record.invoiceNumber, items: record.items.length, amountPaid: record.amountPaid, dueDate: record.dueDate, note: record.invoiceNumber ? `Supplier invoice ${record.invoiceNumber}` : 'Purchase recorded' })),
  ].filter((record) => (status === 'All statuses' || status === 'Saved' || (status === 'Unpaid' && (paymentBalance(record) ?? 0) > 0) || (status === 'Paid' && paymentBalance(record) === 0) || (status === 'Overdue' && isOverdue(record))) && (filter === 'All' || record.kind === filter) && (!date || day(record.date) === date) && [record.name, record.invoice, record.id].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date)), [sales, purchases, filter, date, search, status]);
  const saleTotal = records.filter((record) => record.kind === 'Sale').reduce((sum, record) => sum + Number(record.total), 0);
  const purchaseRecords = records.filter((record) => record.kind === 'Purchase');
  const purchaseHidden = purchaseRecords.some((record) => record.total == null);
  let lastDay = '';
  return <AppScreen><ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Activity</Text><Text style={styles.subtitle}>TRANSACTIONS · SALES & PURCHASES</Text>
    <TextInput accessibilityLabel="Search activity" value={search} onChangeText={setSearch} placeholder="Transaction, customer or supplier" style={screenStyles.search} />
    <View style={screenStyles.chips}>{['All', 'Sale', 'Purchase'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[screenStyles.chip, filter === value && screenStyles.chipActive]}><Text style={[screenStyles.chipText, filter === value && screenStyles.chipTextActive]}>{value}</Text></Pressable>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}><View style={screenStyles.chips}>{['All statuses', 'Saved', 'Unpaid', 'Paid', 'Overdue', 'Drafts'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: status === value }} onPress={() => setStatus(value)} style={[screenStyles.chip, status === value && screenStyles.chipActive]}><Text style={[screenStyles.chipText, status === value && screenStyles.chipTextActive]}>{value}</Text></Pressable>)}</View></ScrollView>
    <View style={styles.dateRow}><TextInput accessibilityLabel="Filter activity date, YYYY-MM-DD" value={date} onChangeText={(value) => { if (/^\d{0,4}(?:-\d{0,2})?(?:-\d{0,2})?$/.test(value)) setDate(value); }} placeholder="All dates · YYYY-MM-DD" style={[screenStyles.search, { flex: 1, marginBottom: 0 }]} maxLength={10} />{date ? <Pressable accessibilityRole="button" onPress={() => setDate('')} style={styles.clear}><Text style={styles.link}>Clear</Text></Pressable> : null}</View>
    {loading ? <ActivityIndicator color="#176B50" /> : error ? <View style={styles.card}><Text accessibilityRole="alert">{error}</Text><ActionButton title="Try again" onPress={() => setRetry((value) => value + 1)} /></View> : <>
      <View style={styles.card}><Text style={styles.name}>Shown saved transactions · {records.length}</Text><View style={styles.totals}><View style={{ flex: 1 }}><Text style={styles.meta}>Sale total</Text><Text style={styles.amount}>{money(saleTotal)}</Text></View><View style={{ flex: 1 }}><Text style={styles.meta}>Purchase total</Text><Text style={styles.amount}>{purchaseHidden ? 'Restricted' : money(purchaseRecords.reduce((sum, record) => sum + Number(record.total ?? 0), 0))}</Text></View></View></View>
      {!records.length ? <View style={styles.card}><Text style={styles.name}>No matching transactions</Text><Text style={styles.meta}>Try another search or date, or record a new sale or purchase.</Text></View> : null}
      {records.map((record) => { const currentDay = day(record.date); const heading = currentDay !== lastDay; lastDay = currentDay; return <View key={`${record.kind}:${record.id}`}>
        {heading ? <Text style={styles.section}>Saved · {new Date(record.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push(record.kind === 'Sale' ? `/sale/${record.id}` : `/purchase/${record.id}`)} style={styles.card}>
          <View style={styles.row}><Ionicons name={record.kind === 'Sale' ? 'arrow-up-outline' : 'arrow-down-outline'} size={24} color="#176B50" /><View style={{ flex: 1 }}><Text style={styles.name}>{record.name}</Text><Text style={styles.meta}>{record.kind} · {record.invoice || record.id.slice(-8).toUpperCase()}</Text></View><Ionicons name="chevron-forward" size={20} color="#176B50" /></View>
          <View style={styles.between}><Text style={styles.amount}>{record.total == null ? 'Restricted price' : money(Number(record.total))}</Text><Text style={styles.badge}>Saved</Text></View><Text style={styles.meta}>{record.items} items · {record.note}</Text>
          <View style={[styles.between, { borderTopWidth: 1, borderColor: '#E0E6E2', paddingTop: 10 }]}><Text style={styles.meta}>{record.kind === 'Sale' ? 'To collect' : 'To pay'}</Text><Text style={styles.link}>{paymentBalance(record) == null ? 'Not confirmed' : money(paymentBalance(record)!)}</Text></View>{record.dueDate ? <Text style={[styles.meta, isOverdue(record) && { color: '#A74737' }]}>Due {record.dueDate.slice(0, 10)} · {isOverdue(record) ? 'Overdue' : paymentBalance(record) === 0 ? 'Settled' : 'Not overdue'}</Text> : null}
        </Pressable>
      </View>; })}
      {['All statuses', 'Drafts'].includes(status) ? <><Text style={styles.section}>Unsaved drafts</Text>{drafts.filter((draft) => (filter === 'All' || draft.kind === filter.toLowerCase()) && (!date || day(draft.updatedAt) === date) && draft.contactName.toLowerCase().includes(search.trim().toLowerCase())).map((draft) => <View key={draft.kind} style={styles.card}><View style={styles.between}><Text style={styles.name}>New {draft.kind} · {draft.contactName || 'No contact yet'}</Text><Text style={[styles.badge, { backgroundColor: '#FFF3DB', color: '#9C640A' }]}>Not saved</Text></View><Text style={styles.meta}>{Object.keys(draft.quantities).length} items · No invoice issued · Excluded from saved totals</Text><Pressable accessibilityRole="button" onPress={() => router.push(draft.kind === 'sale' ? '/sale/create' : '/purchase/create')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>Continue draft →</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { if (appSession.current) void clearDraft(appSession.current, draft.kind).then(() => setDrafts((current) => current.filter((entry) => entry.kind !== draft.kind))).catch(() => setError('Could not discard this draft.')); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.meta}>Discard draft</Text></Pressable></View>)}{!drafts.length ? <Text style={styles.meta}>No unsaved drafts on this device.</Text> : null}</> : null}
    </>}
  </ScrollView></AppScreen>;
}
const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#1C2D26' }, subtitle: { fontSize: 11, color: '#737B77', marginTop: 5, marginBottom: 24 },
  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 18 }, clear: { padding: 12, justifyContent: 'center' }, link: { color: '#176B50', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE5E1', borderRadius: 15, padding: 16, marginBottom: 14, gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: '#24332A' }, meta: { fontSize: 12, color: '#737B77', lineHeight: 18, marginTop: 3 }, amount: { fontSize: 23, color: '#176B50', fontWeight: '800' },
  totals: { flexDirection: 'row', gap: 12, marginTop: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, badge: { backgroundColor: '#E7F2ED', color: '#176B50', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '700' }, section: { fontSize: 16, fontWeight: '700', color: '#24332A', marginBottom: 12 },
});
