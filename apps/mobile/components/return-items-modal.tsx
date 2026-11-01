import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appSession, recordBillReturn, type PurchaseRecord, type SaleRecord } from '@/services/api';
import { returnPreview, returnableLines, type ReturnBill } from '@/services/bill-returns';
import { formatMoney, formatQuantity } from '@/services/format';
import { paymentMethodLabel } from '@/services/payment-methods';
import { requestKey } from '@/services/transaction-accounting';

/**
 * Chooses the lines and quantities that come back on a saved bill and issues
 * a credit note (sale) or debit note (purchase). The value first comes off
 * what is still owed; the rest is refunded in the chosen method. Needs a connection.
 */
export function ReturnItemsModal({ bill, number, units, paidMethod, onClose, onReturned }: { bill: ReturnBill; number: string; units: Record<string, { unit?: string; label: string }>; paidMethod?: string; onClose: () => void; onReturned: (record: SaleRecord | PurchaseRecord) => void }) {
  const sale = bill.kind === 'sale';
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState(paidMethod ?? 'CASH');
  // One request per opened form, so a retry after a dropped connection records the return once.
  const [requestId] = useState(requestKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const lines = returnableLines(bill);
  const preview = returnPreview(bill, typed);
  const refund = Number(preview.refund ?? 0);
  const reduction = Number(preview.balanceReduction ?? 0);
  const amount = (id: string, quantity: string) => { const unit = units[id]; return unit?.unit ? formatQuantity(Number(quantity), unit.unit) : `${quantity} ${unit?.label ?? ''}`.trim(); };
  const type = (id: string, value: string) => { setTyped((current) => ({ ...current, [id]: value.replace(',', '.').replace(/[^\d.]/g, '') })); setError(''); };
  const confirm = async () => {
    const session = appSession.current;
    if (!session || busy) return;
    setTried(true);
    if (preview.error) { setError(preview.error); return; }
    setBusy(true);
    setError('');
    try { onReturned(await recordBillReturn(session, bill.kind, bill.id, { requestId, items: preview.items, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(refund > 0 ? { refundMethod: method } : {}) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record this return. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.card}>
    <Text style={styles.title}>Return items · {number}</Text>
    <Text style={styles.meta}>{sale ? 'Returned items go back into stock and a credit note is issued.' : 'Returned items leave stock and a debit note is issued to the supplier.'} The bill keeps its number and items. This cannot be undone.</Text>
    {lines.map((line) => {
      const left = Number(line.left);
      const entry = preview.lines.find((value) => value.id === line.id);
      return <View key={line.id} style={styles.line}>
        <View style={styles.row}><Text style={[styles.name, { flex: 1 }]}>{line.name}</Text>{entry?.total ? <Text style={styles.name}>{formatMoney(Number(entry.total))}</Text> : null}</View>
        <Text style={styles.meta}>{sale ? 'Sold' : 'Bought'} {amount(line.id, line.sold)}{Number(line.returned) > 0 ? ` · ${amount(line.id, line.returned)} returned` : ''} · {left > 0 ? `${amount(line.id, line.left)} can be returned` : 'Returned in full'}</Text>
        {left > 0 ? <View style={styles.row}>
          <TextInput accessibilityLabel={`Quantity of ${line.name} to return`} value={typed[line.id] ?? ''} editable={!busy} onChangeText={(value) => type(line.id, value)} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9CA3AF" style={[styles.input, { flex: 1 }, tried && entry?.error ? styles.invalid : null]} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Return all ${line.left} of ${line.name}`} disabled={busy} onPress={() => type(line.id, line.left)} style={styles.chip}><Text style={styles.chipText}>All {line.left}</Text></Pressable>
        </View> : null}
        {entry?.error ? <Text style={styles.error}>{entry.error}</Text> : null}
      </View>;
    })}
    <Text style={styles.label}>Reason (optional)</Text>
    <TextInput accessibilityLabel="Reason for the return" value={reason} editable={!busy} onChangeText={setReason} placeholder={sale ? 'e.g. Damaged in transit' : 'e.g. Wrong size delivered'} placeholderTextColor="#9CA3AF" maxLength={200} style={styles.input} />
    {preview.total != null ? <View style={styles.summary}>
      <View style={styles.row}><Text style={styles.name}>{sale ? 'Credit note' : 'Debit note'} value</Text><Text style={styles.amount}>{formatMoney(Number(preview.total))}</Text></View>
      {reduction > 0 ? <Text style={styles.meta}>{formatMoney(reduction)} comes off what {sale ? 'the customer still owes' : 'you still owe the supplier'}.</Text> : null}
      {refund > 0 ? <Text style={styles.meta}>{sale ? `${formatMoney(refund)} is refunded to the customer.` : `The supplier refunds ${formatMoney(refund)}.`}</Text> : null}
    </View> : null}
    {refund > 0 ? <>
      <Text style={styles.label}>{sale ? `Refund ${formatMoney(refund)} by` : `${formatMoney(refund)} comes back by`}</Text>
      <View style={styles.chips}>{['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value, disabled: busy }} disabled={busy} onPress={() => setMethod(value)} style={[styles.method, method === value && styles.selected]}><Text style={{ color: method === value ? '#FFFFFF' : '#24332A' }}>{paymentMethodLabel(value)}</Text></Pressable>)}</View>
      <Text style={styles.meta}>Recorded as a refund entry. No money is transferred by the app.</Text>
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={[styles.primary, busy && { opacity: 0.6 }]}><Text style={styles.primaryText}>{busy ? 'Saving…' : `Issue ${sale ? 'credit' : 'debit'} note`}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.keep}><Text style={styles.keepText}>Close without returning</Text></Pressable>
  </ScrollView></KeyboardAvoidingView></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(20,31,25,0.45)', padding: 20, justifyContent: 'center' }, scroll: { flexGrow: 0, maxHeight: '92%', width: '100%', maxWidth: 540, alignSelf: 'center', borderRadius: 20 }, card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 540, alignSelf: 'center' }, title: { fontSize: 20, fontWeight: '800', color: '#24332A' }, meta: { fontSize: 12, lineHeight: 18, color: '#737B77' }, label: { fontSize: 13, fontWeight: '700', color: '#43554B' }, name: { fontSize: 14, fontWeight: '700', color: '#24332A' }, amount: { fontSize: 18, fontWeight: '800', color: '#176B50' }, line: { gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8E4' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5E1', color: '#24332A' }, invalid: { borderColor: '#A74737' }, chip: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#CFDFD5', justifyContent: 'center' }, chipText: { color: '#176B50', fontWeight: '700' }, summary: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: '#EDF5F0' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, method: { padding: 12, borderRadius: 8, backgroundColor: '#F3F5F4' }, selected: { backgroundColor: '#176B50' }, error: { color: '#A74737', fontSize: 12 }, primary: { minHeight: 48, borderRadius: 10, backgroundColor: '#176B50', justifyContent: 'center', alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '700' }, keep: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, keepText: { color: '#176B50', fontWeight: '700' } });
