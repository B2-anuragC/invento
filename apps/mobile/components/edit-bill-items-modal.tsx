import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChargeGstSwitch } from './charge-gst-switch';
import { TransactionFinanceFields } from './transaction-finance-fields';
import { formatUnitLabel } from './invento-ui';
import { appSession, editBillItems, fetchProduct, fetchProducts, fetchReceiptShop, fetchSuppliers, type BusinessDetails, type ProductRecord, type PurchaseRecord, type SaleRecord, type SupplierRecord } from '@/services/api';
import { addEditLine, billEditInput, billEditPreview, editFormFromBill, editLineKey, linePrice, type EditableBill, type EditForm, type EditLine, type EditProduct } from '@/services/bill-edit';
import { chargeGstSwitch } from '@/services/gst';
import { formatMoney } from '@/services/format';
import { paymentMethodLabel } from '@/services/payment-methods';
import { supplierOffersProduct } from '@/services/supplier-catalog';
import { requestKey } from '@/services/transaction-accounting';

type Bill = SaleRecord | PurchaseRecord;

/** The bill in the shape the edit helpers read. */
export function editableBill(kind: 'sale' | 'purchase', record: Bill): EditableBill {
  return { ...record, isWalkIn: kind === 'sale' ? Boolean((record as SaleRecord).customer?.isWalkIn) : false, discountTotal: 'discountTotal' in record ? record.discountTotal : undefined, discountPercent: 'discountPercent' in record ? record.discountPercent : undefined };
}

// A product the bill still holds but the device could not load (stopped
// selling since): its line keeps the name, unit, option and GST rate it was sold with.
function productFromLine(kind: 'sale' | 'purchase', record: Bill, productId: string): EditProduct {
  const lines = (record.items as Bill['items'][number][]).filter((item) => item.productId === productId);
  const first = lines[0] as SaleRecord['items'][number] & PurchaseRecord['items'][number];
  return {
    id: productId, name: first?.product?.name ?? 'Product', unit: first?.product?.unit ?? first?.unit ?? 'PIECE', gstRate: first?.gstRate == null ? undefined : String(first.gstRate), status: 'INACTIVE',
    sellingPrice: String(first?.sellingPrice ?? 0), purchasePrice: first?.purchasePrice == null ? null : String(first.purchasePrice),
    sellingOptions: kind === 'sale' ? (lines as SaleRecord['items']).filter((item) => item.sellingOptionId).map((item) => ({ id: item.sellingOptionId!, name: item.optionName ?? 'Option', unit: item.unit ?? 'PIECE', quantity: String(item.unitsPerOption ?? 1), sellingPrice: String(item.sellingPrice) })) : [],
  };
}

/**
 * Changes the items, quantities, prices, discount (sales) and GST choice of a
 * saved bill, with a reason. Shows the new total and any refund before saving;
 * the server moves stock by the difference. Owners and admins; needs a connection.
 */
export function EditBillItemsModal({ kind, record, number, paidMethod, onClose, onEdited }: { kind: 'sale' | 'purchase'; record: Bill; number: string; paidMethod?: string; onClose: () => void; onEdited: (record: Bill) => void }) {
  const sale = kind === 'sale';
  const insets = useSafeAreaInsets();
  const bill = useMemo(() => editableBill(kind, record), [kind, record]);
  const [form, setForm] = useState<EditForm>(() => editFormFromBill(kind, bill));
  const [products, setProducts] = useState<Record<string, EditProduct>>({});
  const [catalog, setCatalog] = useState<ProductRecord[]>([]);
  const [supplier, setSupplier] = useState<SupplierRecord | undefined>();
  const [shop, setShop] = useState<BusinessDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState(paidMethod ?? 'CASH');
  // One request per opened form, so a retry after a dropped connection edits the bill once.
  const [requestId] = useState(requestKey);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = appSession.current;
    if (!session) return;
    let active = true;
    void (async () => {
      const [list, shopData, suppliers] = await Promise.all([
        fetchProducts(session).catch(() => [] as ProductRecord[]),
        fetchReceiptShop(session).catch(() => null),
        sale ? Promise.resolve([] as SupplierRecord[]) : fetchSuppliers(session).catch(() => [] as SupplierRecord[]),
      ]);
      const byId: Record<string, EditProduct> = Object.fromEntries(list.map((product) => [product.id, product]));
      for (const productId of new Set(record.items.map((item) => item.productId))) {
        if (byId[productId]) continue;
        byId[productId] = await fetchProduct(session, productId).catch(() => productFromLine(kind, record, productId));
      }
      if (!active) return;
      setProducts(byId);
      setCatalog(list.filter((product) => product.status === 'ACTIVE'));
      setShop(shopData);
      if (!sale) setSupplier(suppliers.find((entry) => entry.id === (record as PurchaseRecord).supplier.id));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [kind, record, sale]);

  // A shop without a GSTIN cannot charge GST on a sale, whatever the switch was left at.
  const gstLocked = chargeGstSwitch(kind, form.chargeGst, shop).disabled;
  const effective: EditForm = { ...form, chargeGst: form.chargeGst && !gstLocked };
  const preview = billEditPreview(kind, bill, effective, products);
  const refund = Number(preview.refund);
  const due = Number(preview.balanceDue);
  const previousTotal = Number(record.total ?? 0);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return catalog.filter((product) => (sale || supplierOffersProduct(supplier, product)) && (product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) || (product.barcode ?? '').toLowerCase().includes(query))).slice(0, 6);
  }, [catalog, sale, search, supplier]);

  const change = (next: Partial<EditForm>) => { setForm((current) => ({ ...current, ...next })); setError(''); };
  const editLine = (index: number, patch: Partial<EditLine>) => change({ lines: form.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const add = (product: ProductRecord, optionId?: string) => { change({ lines: addEditLine(kind, form.lines, product, optionId) }); setSearch(''); };
  const save = async () => {
    const session = appSession.current;
    if (!session || busy) return;
    setTried(true);
    if (preview.error) { setError(preview.error); return; }
    if (!reason.trim()) { setError('Enter why this bill is edited.'); return; }
    setBusy(true);
    setError('');
    try { onEdited(await editBillItems(session, kind, record.id, billEditInput(kind, bill, effective, products, { requestId, reason, refundMethod: method }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save these changes. Please try again.'); }
    finally { setBusy(false); }
  };

  return <Modal animationType="slide" statusBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close without saving" disabled={busy} onPress={onClose} style={styles.back}><Ionicons name="close" size={24} color="#24332A" /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>Edit items</Text><Text style={styles.meta} numberOfLines={1}>{number}</Text></View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#176B50" /> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={styles.meta}>Change the items, quantities, prices{sale ? ', discount' : ''} or GST. Stock is corrected by the difference. The {kind} keeps its number, date, {sale ? 'customer' : 'supplier'} and payments.</Text>
        {form.lines.map((line, index) => {
          const product = products[line.productId];
          const option = line.optionId ? product?.sellingOptions?.find((entry) => entry.id === line.optionId) : undefined;
          const lineError = preview.lineErrors[editLineKey(line)];
          const price = linePrice(line, product);
          const amount = Number(line.quantity || 0) * Number(price || 0);
          const unitLabel = option?.name ?? formatUnitLabel(line.unit ?? product?.unit ?? 'PIECE');
          return <View key={editLineKey(line)} style={styles.line}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}><Text style={styles.name}>{product?.name ?? 'Product'}</Text><Text style={styles.meta}>{unitLabel}{product?.status && product.status !== 'ACTIVE' ? ' · no longer sold; can stay on this bill' : ''}</Text></View>
              <Text style={styles.name}>{formatMoney(Number.isFinite(amount) ? amount : 0)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${product?.name ?? 'item'}`} disabled={busy} onPress={() => change({ lines: form.lines.filter((_, i) => i !== index) })} style={styles.remove}><Ionicons name="trash-outline" size={20} color="#A74737" /></Pressable>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.label}>Quantity</Text>
                <TextInput accessibilityLabel={`Quantity of ${product?.name ?? 'item'}`} value={line.quantity} editable={!busy} keyboardType="decimal-pad" onChangeText={(value) => { if (/^\d{0,9}(?:[.,]\d{0,3})?$/.test(value)) editLine(index, { quantity: value.replace(',', '.') }); }} style={[styles.input, tried && lineError ? styles.invalid : null]} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.label}>{sale ? 'Price' : 'Cost price'} per {option ? 'option' : formatUnitLabel(line.unit ?? product?.unit ?? 'PIECE', 1)} (₹)</Text>
                {option ? <Text style={[styles.input, styles.fixed]}>{formatMoney(Number(option.sellingPrice))}</Text> : <TextInput accessibilityLabel={`Price of ${product?.name ?? 'item'}`} value={line.price} editable={!busy} keyboardType="decimal-pad" onChangeText={(value) => { if (/^\d{0,10}(?:[.,]\d{0,2})?$/.test(value)) editLine(index, { price: value.replace(',', '.') }); }} style={[styles.input, tried && lineError ? styles.invalid : null]} />}
              </View>
            </View>
            {option ? <Text style={styles.meta}>Selling options are charged at their current price.</Text> : null}
            {lineError && (tried || line.quantity !== '') ? <Text style={styles.error}>{lineError}</Text> : null}
          </View>;
        })}
        <Text style={styles.label}>Add an item</Text>
        <TextInput accessibilityLabel="Search products to add" value={search} editable={!busy} onChangeText={setSearch} placeholder="Search by name, SKU or barcode" placeholderTextColor="#9CA3AF" style={styles.input} />
        {search.trim() && !matches.length ? <Text style={styles.meta}>{sale ? 'No active product matches.' : 'No matching product for this supplier.'}</Text> : null}
        {matches.map((product) => <View key={product.id} style={styles.match}>
          <Text style={[styles.name, { flex: 1 }]}>{product.name}</Text>
          <View style={styles.chips}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name}${sale && product.sellingOptions?.length ? ` by the ${formatUnitLabel(product.unit, 1)}` : ''}`} disabled={busy} onPress={() => add(product)} style={styles.chip}><Text style={styles.chipText}>+ {formatUnitLabel(product.unit, 1)}</Text></Pressable>
            {sale ? product.sellingOptions?.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Add ${product.name}, ${option.name}`} disabled={busy} onPress={() => add(product, option.id)} style={styles.chip}><Text style={styles.chipText}>+ {option.name}</Text></Pressable>) : null}
          </View>
        </View>)}
        <TransactionFinanceFields kind={kind} total={preview.total} subtotal={preview.subtotal} tax={preview.tax} chargeGst={effective.chargeGst}
          gstSwitch={<ChargeGstSwitch kind={kind} value={form.chargeGst} onChange={(value) => change({ chargeGst: value })} shop={shop} disabled={busy} />}
          discount={sale ? { mode: form.discountMode, value: form.discountValue, amount: preview.discount, error: preview.discountError, onMode: (mode) => change({ discountMode: mode, discountValue: '' }), onValue: (value) => change({ discountValue: value }) } : undefined} />
        <View style={styles.summary}>
          <View style={[styles.row, styles.between]}><Text style={styles.meta}>Total before</Text><Text style={styles.name}>{formatMoney(previousTotal)}</Text></View>
          <View style={[styles.row, styles.between]}><Text style={styles.meta}>New total</Text><Text style={styles.amount}>{formatMoney(preview.total)}</Text></View>
          {refund > 0 ? <Text style={styles.meta}>{sale ? `${formatMoney(refund)} was paid above the new total and is refunded to the customer.` : `${formatMoney(refund)} was paid above the new total; the supplier refunds it.`}</Text> : null}
          {due > 0 ? <Text style={styles.meta}>{record.amountPaid == null || Number(record.amountPaid) === 0 ? `${formatMoney(due)} ${sale ? 'to collect' : 'to pay'}.` : `${formatMoney(Number(record.amountPaid))} was paid; ${formatMoney(due)} will be ${sale ? 'left to collect' : 'left to pay'}.`}</Text> : null}
          {refund === 0 && due === 0 ? <Text style={styles.meta}>Stays fully paid.</Text> : null}
        </View>
        {refund > 0 ? <>
          <Text style={styles.label}>{sale ? `Refund ${formatMoney(refund)} by` : `${formatMoney(refund)} comes back by`}</Text>
          <View style={styles.chips}>{['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: method === value, disabled: busy }} disabled={busy} onPress={() => setMethod(value)} style={[styles.method, method === value && styles.selected]}><Text style={{ color: method === value ? '#FFFFFF' : '#24332A' }}>{paymentMethodLabel(value)}</Text></Pressable>)}</View>
          <Text style={styles.meta}>Recorded as a refund entry. No money is transferred by the app.</Text>
        </> : null}
        <Text style={styles.label}>Reason for the edit</Text>
        <TextInput accessibilityLabel="Reason for the edit" value={reason} editable={!busy} onChangeText={(value) => { setReason(value); setError(''); }} placeholder={sale ? 'e.g. Customer took one less' : 'e.g. Supplier bill corrected'} placeholderTextColor="#9CA3AF" maxLength={200} style={[styles.input, tried && !reason.trim() ? styles.invalid : null]} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void save()} style={[styles.primary, busy && { opacity: 0.6 }]}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save changes'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.keep}><Text style={styles.keepText}>Close without saving</Text></Pressable>
      </ScrollView>}
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F5F4' }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, minHeight: 64, backgroundColor: '#FFFFFF' }, back: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  content: { padding: 20, gap: 12, width: '100%', maxWidth: 680, alignSelf: 'center' }, title: { fontSize: 22, fontWeight: '800', color: '#24332A' }, meta: { fontSize: 12, lineHeight: 18, color: '#737B77' }, label: { fontSize: 13, fontWeight: '700', color: '#43554B' }, name: { fontSize: 14, fontWeight: '700', color: '#24332A' }, amount: { fontSize: 20, fontWeight: '800', color: '#176B50' },
  line: { gap: 8, padding: 12, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6E2' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { justifyContent: 'space-between' }, remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#DFE5E1', color: '#24332A', backgroundColor: '#FFFFFF' }, fixed: { textAlignVertical: 'center', paddingTop: 14, backgroundColor: '#F3F5F4' }, invalid: { borderColor: '#A74737' },
  match: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6E2' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#CFDFD5', justifyContent: 'center' }, chipText: { color: '#176B50', fontWeight: '700' },
  summary: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: '#EDF5F0' }, method: { padding: 12, borderRadius: 8, backgroundColor: '#FFFFFF' }, selected: { backgroundColor: '#176B50' }, error: { color: '#A74737', fontSize: 12 },
  primary: { minHeight: 48, borderRadius: 10, backgroundColor: '#176B50', justifyContent: 'center', alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '700' }, keep: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, keepText: { color: '#176B50', fontWeight: '700' },
});
