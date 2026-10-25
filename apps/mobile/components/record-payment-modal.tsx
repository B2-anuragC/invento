import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appSession, recordTransactionPayment } from '@/services/api';
import { requestKey } from '@/services/transaction-accounting';
export function RecordPaymentModal({ kind, id, total, amountPaid, onClose, onSaved }: { kind: 'sale' | 'purchase'; id: string; total: string | number; amountPaid?: string | number | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [opening, setOpening] = useState('');
  const [method, setMethod] = useState('CASH');
  const [requestId] = useState(requestKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const balance = Number(total) - Number(amountPaid ?? (opening || 0));
  const save = async () => {
    const session = appSession.current;
    if (!session || busy) return;
    if (!amount || Number(amount) <= 0 || Number(amount) > balance || (amountPaid == null && (!opening || Number(opening) < 0))) { setError('Enter a positive payment within the remaining balance. Confirm the earlier paid amount if requested.'); return; }
    setBusy(true); setError('');
    try {
      await recordTransactionPayment(session, kind, id, { amount, method, requestId, ...(amountPaid == null ? { openingAmountPaid: opening } : {}) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment. Retry uses the same payment request.'); } finally { setBusy(false); }
  };
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.card}>
    <Text style={styles.title}>Record {kind === 'sale' ? 'customer payment' : 'supplier payment'}</Text>
    <Text style={styles.meta}>Record money already received or paid. This does not transfer money.</Text>
    {amountPaid == null ? <><Text style={styles.meta}>Historical payment information is unknown. Enter the total paid before this payment, including 0 if none.</Text><TextInput accessibilityLabel="Previously paid amount" value={opening} editable={!busy} onChangeText={(value) => { if (/^\d{0,12}(?:\.\d{0,2})?$/.test(value)) setOpening(value); }} keyboardType="decimal-pad" placeholder="Previously paid (₹)" style={styles.input} /></> : null}
    <Text style={styles.meta}>Remaining balance: ₹{Math.max(0, balance).toFixed(2)}</Text>
    <TextInput accessibilityLabel="Payment amount" value={amount} editable={!busy} onChangeText={(value) => { if (/^\d{0,12}(?:\.\d{0,2})?$/.test(value)) setAmount(value); }} keyboardType="decimal-pad" placeholder="Payment amount (₹)" style={styles.input} />
    <View style={styles.chips}>{['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value, disabled: busy }} disabled={busy} onPress={() => setMethod(value)} style={[styles.chip, method === value && styles.selected]}><Text style={{ color: method === value ? '#FFFFFF' : '#24332A' }}>{value.replaceAll('_', ' ')}</Text></Pressable>)}</View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>{busy ? 'Recording payment…' : 'Record payment'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.cancel}><Text style={styles.meta}>Cancel</Text></Pressable>
  </ScrollView></KeyboardAvoidingView></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(20,31,25,0.45)', padding: 20, justifyContent: 'center' }, scroll: { flexGrow: 0, maxHeight: '90%', width: '100%', maxWidth: 540, alignSelf: 'center', borderRadius: 20 }, card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 540, alignSelf: 'center' }, title: { fontSize: 20, fontWeight: '800', color: '#24332A' }, meta: { fontSize: 12, lineHeight: 18, color: '#737B77' }, input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5E1' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 12, borderRadius: 8, backgroundColor: '#F3F5F4' }, selected: { backgroundColor: '#176B50' }, error: { color: '#A74737', fontSize: 12 }, save: { minHeight: 48, borderRadius: 10, backgroundColor: '#176B50', justifyContent: 'center', alignItems: 'center' }, saveText: { color: '#FFFFFF', fontWeight: '700' }, cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center' } });
