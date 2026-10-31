import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appSession, cancelBill, type PurchaseRecord, type SaleRecord } from '@/services/api';
import { formatMoney } from '@/services/format';
import { paymentMethodLabel } from '@/services/payment-methods';

/** Asks why a saved bill is cancelled and how money already paid goes back. Needs a connection. */
export function CancelBillModal({ kind, id, number, paid, paidMethod, onClose, onCancelled }: { kind: 'sale' | 'purchase'; id: string; number: string; paid: number; paidMethod?: string; onClose: () => void; onCancelled: (record: SaleRecord | PurchaseRecord) => void }) {
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState(paidMethod ?? 'CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    const session = appSession.current;
    if (!session || busy) return;
    if (!reason.trim()) { setError('Enter why this bill is cancelled.'); return; }
    setBusy(true);
    setError('');
    try { onCancelled(await cancelBill(session, kind, id, { reason: reason.trim(), ...(paid > 0 ? { refundMethod: method } : {}) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel this bill. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.card}>
    <Text style={styles.title}>Cancel {kind} {number}?</Text>
    <Text style={styles.meta}>{kind === 'sale' ? 'Its items go back into stock.' : 'Its items are taken out of stock again.'} The bill stays in history as Cancelled and keeps its number. This cannot be undone.</Text>
    <Text style={styles.label}>Reason</Text>
    <TextInput accessibilityLabel="Reason for cancelling" value={reason} editable={!busy} onChangeText={(value) => { setReason(value); setError(''); }} placeholder={kind === 'sale' ? 'e.g. Customer returned the goods' : 'e.g. Entered against the wrong supplier'} placeholderTextColor="#9CA3AF" maxLength={200} style={styles.input} />
    {paid > 0 ? <>
      <Text style={styles.label}>{kind === 'sale' ? `Refund ${formatMoney(paid)} to the customer by` : `${formatMoney(paid)} comes back from the supplier by`}</Text>
      <View style={styles.chips}>{['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value, disabled: busy }} disabled={busy} onPress={() => setMethod(value)} style={[styles.chip, method === value && styles.selected]}><Text style={{ color: method === value ? '#FFFFFF' : '#24332A' }}>{paymentMethodLabel(value)}</Text></Pressable>)}</View>
      <Text style={styles.meta}>Recorded as a refund entry. No money is transferred by the app.</Text>
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={[styles.danger, busy && { opacity: 0.6 }]}><Text style={styles.dangerText}>{busy ? 'Cancelling…' : `Cancel ${kind}`}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.keep}><Text style={styles.keepText}>Keep {kind}</Text></Pressable>
  </ScrollView></KeyboardAvoidingView></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(20,31,25,0.45)', padding: 20, justifyContent: 'center' }, scroll: { flexGrow: 0, maxHeight: '90%', width: '100%', maxWidth: 540, alignSelf: 'center', borderRadius: 20 }, card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 540, alignSelf: 'center' }, title: { fontSize: 20, fontWeight: '800', color: '#24332A' }, meta: { fontSize: 12, lineHeight: 18, color: '#737B77' }, label: { fontSize: 13, fontWeight: '700', color: '#43554B' }, input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5E1', color: '#24332A' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 12, borderRadius: 8, backgroundColor: '#F3F5F4' }, selected: { backgroundColor: '#176B50' }, error: { color: '#A74737', fontSize: 12 }, danger: { minHeight: 48, borderRadius: 10, backgroundColor: '#A74737', justifyContent: 'center', alignItems: 'center' }, dangerText: { color: '#FFFFFF', fontWeight: '700' }, keep: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, keepText: { color: '#176B50', fontWeight: '700' } });
