import { usePermissions } from '@/services/permissions';
import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { DatePicker } from '@/components/date-picker';
import { activityRangeBounds, activityRangeLabel, activityRangeOptions, inActivityRange, type ActivityRange } from '@/services/activity-range';
import { indiaDate } from '@/services/dashboard-summary';
import { readDraft, clearDraft, type TransactionDraft } from '@/services/transaction-drafts';
import { paymentBalance, isOverdue, countedAmount, netAmount } from '@/services/transaction-accounting';
import { returnSummary } from '@/services/bill-returns';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@/components/ui/icon';
import { ActionButton, AppScreen } from '@/components/invento-ui';
import { ChipRow, FilterButton, FilterSheet, ListHeader, SearchField, SheetChoices, StatStrip, StickyBar, screenStyles } from '@/components/screen-heading';
import { activeFilterChips, activeFilterCount, filterButtonLabels } from '@/services/list-header';
import { appSession, fetchSales, fetchPurchases, type SaleRecord, type PurchaseRecord } from '@/services/api';
import { formatDate, formatMoney as money, plural } from '@/services/format';
import { transactionNumber } from '@/services/transaction-labels';

export default function ActivityScreen() {
  const router = useRouter();
  const { can, access } = usePermissions();
  // Load once permissions are known: on a direct visit they arrive after the screen gains focus.
  const permissionKey = access?.permissions.join(',') ?? '';
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<ActivityRange>({ kind: 'all' });
  // Worked out on every render so Today and This week move on at midnight in India.
  const bounds = activityRangeBounds(range);
  const boundsKey = `${bounds?.from ?? ''}~${bounds?.to ?? ''}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState('All statuses');
  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const session = appSession.current;
    if (!session) { setLoading(false); setError('Sign in to view activity.'); return; }
    if (!permissionKey) return;
    setLoading(true); setError('');
    Promise.all([can('sales.view') ? fetchSales(session) : [], can('purchases.view') ? fetchPurchases(session) : [], can('sales.create') ? readDraft(session, 'sale') : null, can('purchases.create') ? readDraft(session, 'purchase') : null, can('sales.create') ? readDraft(session, 'sale', 'quick') : null]).then(async ([saleData, purchaseData, saleDraft, purchaseDraft, quickDraft]) => {
      const pending: TransactionDraft[] = [];
      for (const draft of [saleDraft, purchaseDraft, ...(quickDraft ? [{ ...quickDraft, source: 'quick' as const }] : [])]) {
        if (!draft) continue;
        const saved = (draft.kind === 'sale' ? saleData : purchaseData).some((record) => record.requestId === draft.requestId);
        if (saved) await clearDraft(session, draft.kind, draft.source === 'quick' ? 'quick' : 'standard'); else pending.push(draft);
      }
      if (active) { setSales(saleData); setPurchases(purchaseData); setDrafts(pending); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load activity.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Retry intentionally reruns this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry, sync.syncing, permissionKey]));
  const records = useMemo(() => [
    ...sales.map((record) => ({ id: record.id, syncState: record.syncState, kind: 'Sale' as const, name: record.customer.name, date: record.saleDate, status: record.status, total: record.total, netTotal: record.netTotal, returnedTotal: record.returnedTotal, returned: returnSummary(record), returnNumbers: (record.returns ?? []).map((note) => note.documentNumber), invoice: record.invoiceNumber, documentNumber: record.documentNumber, items: record.items.length, amountPaid: record.amountPaid, dueDate: record.dueDate, note: record.paymentMethod.replaceAll('_', ' ') })),
    ...purchases.map((record) => ({ id: record.id, syncState: record.syncState, kind: 'Purchase' as const, name: record.supplier.name, date: record.purchaseDate, status: record.status, total: record.total, netTotal: record.netTotal, returnedTotal: record.returnedTotal, returned: returnSummary(record), returnNumbers: (record.returns ?? []).map((note) => note.documentNumber), invoice: record.invoiceNumber, documentNumber: record.documentNumber, items: record.items.length, amountPaid: record.amountPaid, dueDate: record.dueDate, note: record.invoiceNumber ? `Supplier invoice ${record.invoiceNumber}` : 'Purchase recorded' })),
  ].filter((record) => (status === 'All statuses' || (status === 'Saved' && !record.syncState) || (status === 'Pending sync' && record.syncState === 'pending') || (status === 'Needs attention' && record.syncState === 'conflict') || (status === 'Unpaid' && (paymentBalance(record) ?? 0) > 0) || (status === 'Paid' && paymentBalance(record) === 0) || (status === 'Overdue' && isOverdue(record))) && (filter === 'All' || record.kind === filter) && inActivityRange(record.date, bounds) && [record.name, record.documentNumber, record.invoice, record.id, ...record.returnNumbers].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date)), // bounds is captured through boundsKey, which changes whenever it does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sales, purchases, filter, boundsKey, search, status]);
  // Net of returns; cancelled bills count nothing.
  const saleTotal = records.filter((record) => record.kind === 'Sale').reduce((sum, record) => sum + countedAmount(record), 0);
  const purchaseRecords = records.filter((record) => record.kind === 'Purchase');
  const purchaseHidden = purchaseRecords.some((record) => record.total == null);
  let lastDay = '';
  const rangeText = range.kind === 'custom' ? (activityRangeLabel(bounds) || 'Custom dates') : activityRangeOptions.find((option) => option.kind === range.kind)?.label ?? '';
  const sheetFilters = activeFilterChips([
    { key: 'status', value: status, defaultValue: 'All statuses' },
    { key: 'range', value: range.kind, defaultValue: 'all', label: rangeText },
  ]);
  const filterLabels = filterButtonLabels(activeFilterCount({ status, range: range.kind }, { status: 'All statuses', range: 'all' }));
  const purchaseTotal = purchaseHidden ? 'Restricted' : money(purchaseRecords.reduce((sum, record) => sum + countedAmount(record), 0));
  return <AppScreen><ScrollView contentContainerStyle={screenStyles.listContent} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}>
    <View>
      <ListHeader title="Activity" back />
      {!loading && !error ? <StatStrip items={[{ label: 'Shown', value: String(records.length), tone: 'blue' }, { label: 'Sales', value: money(saleTotal) }, { label: 'Purchases', value: purchaseTotal, tone: 'amber' }]} note={records.some((record) => record.syncState) ? 'Totals include bills saved on this device and not yet synced.' : null} /> : null}
    </View>
    <StickyBar>
      <SearchField accessibilityLabel="Search activity" value={search} onChangeText={setSearch} placeholder="Transaction, customer or supplier" trailing={<FilterButton text={filterLabels.text} accessibilityLabel={filterLabels.accessibilityLabel} active={sheetFilters.length > 0} onPress={() => setShowFilters(true)} />} />
      <ChipRow label="Filter activity" options={[['All', 'All'], ['Sale', 'Sales'], ['Purchase', 'Purchases']].map(([value, label]) => ({ key: value, label, selected: filter === value, onPress: () => setFilter(value) }))} clearable={sheetFilters} onClear={(key) => (key === 'status' ? setStatus('All statuses') : setRange({ kind: 'all' }))} />
    </StickyBar>
    {loading ? <ActivityIndicator color="#176B50" /> : error ? <View style={styles.card}><Text accessibilityRole="alert">{error}</Text><ActionButton title="Try again" onPress={() => setRetry((value) => value + 1)} /></View> : <>
      {!records.length ? <View style={styles.card}><Text style={styles.name}>No matching transactions</Text><Text style={styles.meta}>Try another search or date range, or record a new sale or purchase.</Text></View> : null}
      {records.map((record) => { const currentDay = indiaDate(record.date); const heading = currentDay !== lastDay; lastDay = currentDay; return <View key={`${record.kind}:${record.id}`}>
        {heading ? <Text style={styles.section}>Transactions · {formatDate(currentDay)}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push(record.kind === 'Sale' ? `/sale/${record.id}` : `/purchase/${record.id}`)} style={styles.card}>
          <View style={styles.row}><Ionicons name={record.kind === 'Sale' ? 'arrow-up-outline' : 'arrow-down-outline'} size={24} color="#176B50" /><View style={{ flex: 1 }}><Text style={styles.name}>{record.name}</Text><Text style={styles.meta}>{record.kind} · {transactionNumber(record.kind === 'Sale' ? 'sale' : 'purchase', { id: record.id, documentNumber: record.documentNumber, invoiceNumber: record.kind === 'Sale' ? record.invoice : null })}</Text></View><Ionicons name="chevron-forward" size={20} color="#176B50" /></View>
          <View style={styles.between}><Text style={styles.amount}>{record.total == null ? 'Restricted price' : money(netAmount(record) ?? 0)}</Text><Text style={styles.badge}>{record.syncState === 'conflict' ? 'Needs attention' : record.syncState ? 'Pending sync' : 'Saved'}</Text></View><Text style={styles.meta}>{plural(record.items, 'item')} · {record.note}</Text>{record.status === 'CANCELLED' ? <Text style={[styles.meta, { color: '#A74737', fontWeight: '700' }]}>Cancelled</Text> : null}{record.returned ? <Text style={[styles.meta, { color: '#9C5B12', fontWeight: '700' }]}>{record.returned}</Text> : null}
          <View style={[styles.between, { borderTopWidth: 1, borderColor: '#E0E6E2', paddingTop: 10 }]}><Text style={styles.meta}>{record.kind === 'Sale' ? 'To collect' : 'To pay'}</Text><Text style={styles.link}>{paymentBalance(record) == null ? 'Not confirmed' : money(paymentBalance(record)!)}</Text></View>{record.dueDate ? <Text style={[styles.meta, isOverdue(record) && { color: '#A74737' }]}>Due {record.dueDate.slice(0, 10)} · {isOverdue(record) ? 'Overdue' : paymentBalance(record) === 0 ? 'Settled' : 'Not overdue'}</Text> : null}
        </Pressable>
      </View>; })}
      {['All statuses', 'Drafts'].includes(status) ? <><Text style={styles.section}>Unsaved drafts</Text>{drafts.filter((draft) => (filter === 'All' || draft.kind === filter.toLowerCase()) && inActivityRange(draft.updatedAt, bounds) && draft.contactName.toLowerCase().includes(search.trim().toLowerCase())).map((draft) => <View key={`${draft.kind}:${draft.source ?? 'standard'}`} style={styles.card}><View style={styles.between}><Text style={styles.name}>{draft.source === 'quick' ? 'New sale' : draft.kind === 'sale' ? 'Sale form' : 'New purchase'} · {draft.contactName || 'No contact yet'}</Text><Text style={[styles.badge, { backgroundColor: '#FFF3DB', color: '#9C640A' }]}>Not saved</Text></View><Text style={styles.meta}>{plural(Object.keys(draft.quantities).length, 'item')} · No invoice issued · Excluded from saved totals</Text><Pressable accessibilityRole="button" onPress={() => router.push(draft.source === 'quick' ? '/sale/quick' : draft.kind === 'sale' ? '/sale/create' : '/purchase/create')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>Continue draft →</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { if (appSession.current) void clearDraft(appSession.current, draft.kind, draft.source === 'quick' ? 'quick' : 'standard').then(() => setDrafts((current) => current.filter((entry) => entry.kind !== draft.kind || entry.source !== draft.source))).catch(() => setError('Could not discard this draft.')); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.meta}>Discard draft</Text></Pressable></View>)}{!drafts.length ? <Text style={styles.meta}>No unsaved drafts on this device.</Text> : null}</> : null}
    </>}
  </ScrollView>
  <FilterSheet visible={showFilters} onClose={() => setShowFilters(false)} onReset={() => { setStatus('All statuses'); setRange({ kind: 'all' }); }}>
    <SheetChoices title="Status" options={['All statuses', 'Saved', 'Pending sync', 'Needs attention', 'Unpaid', 'Paid', 'Overdue', 'Drafts'].map((value) => ({ key: value, label: value, selected: status === value, onPress: () => setStatus(value) }))} />
    <SheetChoices title="Dates" options={activityRangeOptions.map((option) => ({ key: option.kind, label: option.label, selected: range.kind === option.kind, onPress: () => setRange((current) => ({ ...current, kind: option.kind })) }))} />
    {range.kind === 'custom' ? <View style={styles.dateRow}><DatePicker value={range.from ?? ''} onChange={(from) => setRange((current) => ({ ...current, from }))} title="Select start date" placeholder="From" clearLabel="Any start" maximumDate={range.to || undefined} style={{ flex: 1 }} /><DatePicker value={range.to ?? ''} onChange={(to) => setRange((current) => ({ ...current, to }))} title="Select end date" placeholder="To" clearLabel="Any end" minimumDate={range.from || undefined} style={{ flex: 1 }} /></View> : null}
    {range.kind !== 'all' ? <Text style={styles.meta}>{activityRangeLabel(bounds) ? `Showing ${activityRangeLabel(bounds)}` : 'Choose a start or end date'}</Text> : null}
  </FilterSheet>
  </AppScreen>;
}
const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 8 }, link: { color: '#176B50', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE5E1', borderRadius: 15, padding: 16, marginBottom: 14, gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: '#24332A' }, meta: { fontSize: 12, color: '#737B77', lineHeight: 18, marginTop: 3 }, amount: { fontSize: 23, color: '#176B50', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, badge: { backgroundColor: '#E7F2ED', color: '#176B50', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '700' }, section: { fontSize: 14, fontWeight: '800', color: '#43554B', marginBottom: 8, marginTop: 4 },
});
