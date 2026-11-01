import { DatePicker } from './date-picker';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { moneyValue, validDueDate } from '@/services/transaction-accounting';
import { formatMoney as money } from '@/services/format';
import { paymentMethodLabel } from '@/services/payment-methods';
import { dateKey } from '@/services/date-limits';
export type DiscountMode = 'amount' | 'percent';

/** A sale's bill discount, as typed; amount is what it takes off the subtotal. */
export type DiscountField = { mode: DiscountMode; value: string; amount: number; error: string; onMode: (mode: DiscountMode) => void; onValue: (value: string) => void };

export function TransactionFinanceFields({ kind, total, subtotal, tax, chargeGst = true, gstSwitch, discount, mode, onMode, paid, onPaid, dueDate, onDueDate, method, onMethod }: {
  kind: 'sale' | 'purchase'; total: number; subtotal: number; tax: number; /** False hides the GST row: the bill charges none. */ chargeGst?: boolean; /** The bill's GST switch, shown above the totals. */ gstSwitch?: ReactNode; discount?: DiscountField;
  /** The payment taken with a new bill; left out when editing a saved bill, whose payments stay. */
  mode?: 'full' | 'partial' | 'credit'; onMode?: (value: 'full' | 'partial' | 'credit') => void; paid?: string; onPaid?: (value: string) => void; dueDate?: string; onDueDate?: (value: string) => void; method?: string; onMethod?: (value: string) => void;
}) {
  const payment = mode === 'full' ? total : mode === 'credit' ? 0 : Number(paid || 0);
  const withPayment = Boolean(mode && onMode && onPaid && onDueDate && onMethod);
  const invalid = mode === 'partial' && (!paid || !Number.isFinite(payment) || payment <= 0 || payment >= total);
  return <View style={styles.card}>
    {gstSwitch}
    <View style={styles.row}><Text style={styles.meta}>{chargeGst ? 'Subtotal · excluding GST' : 'Subtotal'}</Text><Text style={styles.bold}>{money(subtotal)}</Text></View>
    {discount ? <View style={styles.discount}>
      <View style={styles.row}><Text style={styles.meta}>{chargeGst ? 'Discount · before GST' : 'Discount'}</Text><Text style={styles.bold}>{discount.amount > 0 ? `−${money(discount.amount)}` : money(0)}</Text></View>
      <View style={styles.discountInput}>
        <View style={styles.segment}>{(['amount', 'percent'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'amount' ? 'Discount in rupees' : 'Discount in percent'} accessibilityState={{ selected: discount.mode === value }} onPress={() => discount.onMode(value)} style={[styles.segmentItem, discount.mode === value && styles.selected]}><Text aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.chipText, discount.mode === value && styles.selectedText]}>{value === 'amount' ? '₹' : '%'}</Text></Pressable>)}</View>
        <TextInput accessibilityLabel={discount.mode === 'amount' ? 'Discount amount in rupees' : 'Discount percentage'} keyboardType="decimal-pad" value={discount.value} onChangeText={(value) => { if ((discount.mode === 'amount' ? /^\d{0,12}(?:\.\d{0,2})?$/ : /^\d{0,3}(?:\.\d{0,2})?$/).test(value)) discount.onValue(value); }} placeholder={discount.mode === 'amount' ? '0.00' : '0'} placeholderTextColor="#9CA3AF" style={[styles.input, { flex: 1 }]} />
      </View>
      {discount.error ? <Text style={styles.error}>{discount.error}</Text> : chargeGst ? <Text style={styles.meta}>GST is charged on the discounted price.</Text> : null}
    </View> : null}
    {chargeGst ? <View style={styles.row}><Text style={styles.meta}>GST · configured item rates</Text><Text style={styles.bold}>{money(tax)}</Text></View> : null}
    <View style={[styles.row, styles.totalRow]}><Text style={styles.meta}>Total amount</Text><Text style={styles.total}>{money(total)}</Text></View>
    {withPayment ? <>
    <Text style={styles.title}>{kind === 'sale' ? 'Payment received' : 'Payment to supplier'}</Text>
    <View style={styles.chips}>{(['full', 'partial', 'credit'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => onMode!(value)} style={[styles.chip, mode === value && styles.selected]}><Text style={[styles.chipText, mode === value && styles.selectedText]}>{value === 'full' ? 'Fully paid' : value === 'partial' ? 'Partial' : 'Full credit'}</Text></Pressable>)}</View>
    {mode === 'partial' ? <><Text style={styles.meta}>{kind === 'sale' ? 'Amount received (₹)' : 'Amount paid (₹)'}</Text><TextInput accessibilityLabel="Initial payment amount" keyboardType="decimal-pad" value={paid ?? ''} onChangeText={(value) => { if (/^\d{0,12}(?:\.\d{0,2})?$/.test(value)) onPaid!(value); }} placeholder="0.00" style={styles.input} />{invalid ? <Text style={styles.error}>Enter an amount greater than zero and below the total.</Text> : null}</> : null}
    {mode !== 'credit' ? <><Text style={styles.meta}>Payment method</Text><View style={styles.chips}>{['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value }} onPress={() => onMethod!(value)} style={[styles.chip, method === value && styles.selected]}><Text style={[styles.chipText, method === value && styles.selectedText]}>{paymentMethodLabel(value)}</Text></Pressable>)}</View></> : null}
    <View style={styles.row}><Text style={styles.meta}>{kind === 'sale' ? 'Balance to collect' : 'Balance to pay'}</Text><Text style={styles.bold}>{money(Math.max(0, moneyValue(total - payment)))}</Text></View>
    {mode !== 'full' ? <><Text style={styles.meta}>Due date · optional</Text><DatePicker minimumDate={dateKey(new Date())} value={dueDate ?? ''} onChange={onDueDate!} title="Select payment due date" placeholder="No due date" clearLabel="Clear due date" />{!validDueDate(dueDate ?? '') ? <Text style={styles.error}>Choose a valid due date from the calendar.</Text> : null}</> : null}
    <Text style={styles.meta}>Payment entries are saved with this transaction. No money is transferred by the app.</Text>
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6E2', gap: 12, marginVertical: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, meta: { color: '#737B77', fontSize: 12, lineHeight: 18 }, bold: { color: '#24332A', fontWeight: '700', fontSize: 14 }, totalRow: { borderTopWidth: 1, borderTopColor: '#E0E6E2', paddingTop: 12 }, total: { color: '#176B50', fontSize: 24, fontWeight: '800' }, title: { color: '#24332A', fontSize: 15, fontWeight: '700', marginTop: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: '#DFE5E1', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 }, selected: { backgroundColor: '#176B50', borderColor: '#176B50' }, chipText: { color: '#68746E', fontSize: 12, fontWeight: '600' }, selectedText: { color: '#FFFFFF' }, input: { borderWidth: 1, borderColor: '#DFE5E1', minHeight: 48, borderRadius: 10, paddingHorizontal: 12, color: '#24332A' }, error: { color: '#A74737', fontSize: 12 }, discount: { gap: 8 }, discountInput: { flexDirection: 'row', alignItems: 'center', gap: 8 }, segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#DFE5E1', borderRadius: 10, overflow: 'hidden' }, segmentItem: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
