import { usePermissions } from '@/services/permissions';
import { LOCAL_ONLY } from '@/services/runtime-mode';
import { PurchaseAttachment } from './purchase-attachment';
import { CancelBillModal } from './cancel-bill-modal';
import { SaleReferencePhoto } from './sale-reference-photo';
import type { PaymentRecord, FileAttachment, BusinessDetails, SaleRecord } from '@/services/api';
import { paymentBalance, isOverdue } from '@/services/transaction-accounting';
import { formatDate, formatMoney, formatQuantity } from '@/services/format';
import { paymentMethodLabel, paymentMethodsSummary } from '@/services/payment-methods';
import { receiptIdentity } from '@/services/transaction-labels';
import { savedLineKey } from '@/services/bill-lines';
import { lineTaxText, receiptTitle, saleGstDetails, stateLabel, taxTotalRows, type SaleGstDetails } from '@/services/gst';
import { invoiceFileName, invoiceHtml } from '@/services/invoice-document';
import { receiptShareText } from '@/services/receipt-text';
import { chargesGst } from '@invento/shared';
import { canSharePdf, printInvoice, shareInvoicePdf } from '@/services/invoice-print';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { appSession, fetchSale, fetchPurchase, fetchReceiptShop } from '@/services/api';
import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { Pressable, ScrollView, Share, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ReceiptData = {
  syncState?: 'pending' | 'conflict';
  /** COMPLETED, or CANCELLED with when and why. */
  status?: string;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  syncError?: string;
  referenceImage?: string | null;
  attachment?: FileAttachment | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  /** GST details the sale was issued with; absent on purchases and older sales. */
  gst?: SaleGstDetails | null;
  /** False when the bill charged no GST; missing on older bills, which did. */
  chargeGst?: boolean | null;
  id: string; kind: 'sale' | 'purchase'; date: string; invoice?: string | null; documentNumber?: string | null; contact: string; total?: string | number | null; paymentMethod?: string; note?: string | null;
  subtotal?: string | number; discountTotal?: string | number; discountPercent?: string | number | null; taxTotal?: string | number; amountPaid?: string | number | null; dueDate?: string | null; payments?: PaymentRecord[];
  /** lineKey matches a line to the server's copy, which lists lines in another order. */
  items: { id: string; lineKey?: string; name: string; sku?: string; quantity: number; label: string; unit?: string; price?: number; stockAfter?: number; stockUnit?: string; gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number; discountAmount?: string | number; hsnCode?: string | null }[];
};
const money = formatMoney;
export function TransactionReceipt({ data: initialData, inModal = false, onBack, onNew, onRepeat, onPayment }: { data: ReceiptData; inModal?: boolean; onBack: () => void; onView?: () => void; onNew: () => void; onRepeat?: () => void; onPayment?: () => void }) {
  const { can } = usePermissions();
  const mayCreate = can(initialData.kind === 'sale' ? 'sales.create' : 'purchases.create');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [shop, setShop] = useState<BusinessDetails | null>(null);
  const methods = paymentMethodsSummary(data.payments, data.paymentMethod);
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  useEffect(() => { setData(initialData); }, [initialData]);
  useEffect(() => {
    const session = appSession.current;
    if (!session) return;
    let active = true;
    fetchReceiptShop(session).then((value) => { if (active) setShop(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const session = appSession.current;
    if (!session || !initialData.syncState) return;
    let active = true;
    const load = initialData.kind === 'sale' ? fetchSale(session, initialData.id) : fetchPurchase(session, initialData.id);
    void load.then((record) => {
      if (!active) return;
      setData({ ...initialData, id: record.id, invoice: record.invoiceNumber, documentNumber: record.documentNumber, status: record.status, cancelReason: record.cancelReason, cancelledAt: record.cancelledAt, gst: initialData.kind === 'sale' ? saleGstDetails(record as SaleRecord) : undefined, chargeGst: record.chargeGst ?? initialData.chargeGst, syncState: record.syncState, syncError: record.syncError, total: record.total, subtotal: record.subtotal, discountTotal: 'discountTotal' in record ? record.discountTotal : undefined, discountPercent: 'discountPercent' in record ? record.discountPercent : undefined, taxTotal: record.taxTotal, amountPaid: record.amountPaid, dueDate: record.dueDate, payments: record.payments, items: record.items.map((item, index) => ({ ...(initialData.items.find((entry) => entry.lineKey === savedLineKey(initialData.kind, item)) ?? initialData.items[index]), id: item.id, name: item.product?.name ?? initialData.items[index]?.name ?? 'Product', quantity: Number(item.quantity), price: 'sellingPrice' in item ? Number(item.sellingPrice) : item.purchasePrice == null ? undefined : Number(item.purchasePrice), gstRate: item.gstRate, taxAmount: item.taxAmount, lineTotal: item.lineTotal, discountAmount: 'discountAmount' in item ? item.discountAmount : undefined, hsnCode: 'hsnCode' in item ? item.hsnCode : undefined })) });
    }).catch(() => {});
    return () => { active = false; };
  }, [initialData, sync.syncing, sync.pending, sync.conflicts]);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState<'print' | 'pdf' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const title = data.kind === 'sale' ? 'Sale' : 'Purchase';
  const heading = receiptTitle(data.kind, data.gst, data.documentNumber, data.chargeGst);
  const taxed = chargesGst(data.chargeGst);
  const shopName = shop?.name ?? appSession.current?.businessName ?? '';
  const taxRows = data.taxTotal == null ? [] : taxTotalRows(data.items, data.gst?.taxType, data.taxTotal, data.chargeGst);
  const identity = receiptIdentity(data.kind, { id: data.id, documentNumber: data.documentNumber, invoiceNumber: data.invoice, syncState: data.syncState });
  const identifier = identity.value;
  const balance = paymentBalance(data);
  const overdue = isOverdue(data);
  const cancelled = data.status === 'CANCELLED';
  const refunded = (data.payments ?? []).filter((payment) => payment.kind === 'REFUND').reduce((sum, payment) => sum + Number(payment.amount), 0);
  const mayCancel = can(data.kind === 'sale' ? 'sales.cancel' : 'purchases.cancel') && !data.syncState && !cancelled && !LOCAL_ONLY;
  const total = data.total == null ? 'Restricted price' : money(Number(data.total));
  const share = async () => {
    setError('');
    try {
      const message = receiptShareText(data, { title: heading, identifier, shopName });
      if (data.kind === 'sale') {
        const raw = data.contactPhone?.trim() ?? '';
        let phone = raw.replace(/\D/g, '');
        if (raw.startsWith('00')) phone = phone.slice(2);
        if (!raw.startsWith('+') && !raw.startsWith('00')) {
          if (/^0[6-9]\d{9}$/.test(phone)) phone = phone.slice(1);
          if (/^[6-9]\d{9}$/.test(phone)) phone = `91${phone}`;
        }
        if (!/^[1-9]\d{6,14}$/.test(phone)) { setError('Save a valid customer phone number with country code to share on WhatsApp.'); return; }
        const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        if (Platform.OS === 'web') await Linking.openURL(webUrl);
        else { try { await Linking.openURL(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`); } catch { await Linking.openURL(webUrl); } }
      } else await Share.share({ message });
    } catch { setError('Could not share this receipt. Please try again.'); }
  };
  // The A4 invoice waits for the bill's number, so a provisional bill is never printed or sent.
  const runDocument = async (action: 'print' | 'pdf') => {
    if (preparing || data.syncState) return;
    setPreparing(action);
    setError('');
    try {
      const html = invoiceHtml(data, shop ?? { name: shopName });
      if (action === 'print') await printInvoice(html);
      else await shareInvoicePdf(html, invoiceFileName(data));
    } catch {
      setError(action === 'print' ? 'Could not open printing. Please try again.' : 'Could not create the PDF. Please try again.');
    } finally {
      setPreparing(null);
    }
  };
  return <View style={[styles.screen, { paddingTop: inModal ? insets.top : 0, paddingLeft: inModal ? insets.left : 0, paddingRight: inModal ? insets.right : 0 }]}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Close receipt" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={24} color="#24332A" /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>{heading}</Text><Text style={styles.meta} numberOfLines={1}>{[shopName, formatDate(data.date)].filter(Boolean).join(' · ')}</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {cancelled ? <View style={[styles.success, styles.cancelledBanner]}><Ionicons name="close-circle-outline" size={21} color="#A74737" /><View style={{ flex: 1 }}><Text style={[styles.greenTitle, { color: '#A74737' }]}>Cancelled{data.cancelledAt ? ` · ${formatDate(data.cancelledAt)}` : ''}</Text>{data.cancelReason ? <Text style={[styles.greenCopy, { color: '#7A3A2F' }]}>Reason: {data.cancelReason}</Text> : null}<Text style={[styles.greenCopy, { color: '#7A3A2F' }]}>Stock was reversed{refunded > 0 ? ` and ${money(refunded)} refunded` : ''}. The bill keeps its number.</Text></View></View> : <View style={styles.success}><Ionicons name="checkmark-circle-outline" size={21} color="#176B50" /><View style={{ flex: 1 }}><Text style={styles.greenTitle}>{data.syncState === 'conflict' ? 'Needs attention · Saved on device' : data.syncState ? LOCAL_ONLY ? 'Saved on device · Finalizing' : 'Saved on device · Pending sync' : `Saved · ${title} recorded`}</Text><Text style={styles.greenCopy}>{LOCAL_ONLY ? 'This bill and its stock changes are stored only on this device.' : data.syncState ? 'Provisional receipt. Stock is adjusted on this device; the server has not confirmed this transaction.' : 'This is a saved transaction. Inventory has been updated.'}</Text>{data.syncError ? <Text style={styles.error}>{data.syncError}</Text> : null}{data.syncState ? <Pressable accessibilityRole="button" onPress={() => router.push('/settings/sync')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.greenTitle}>View sync status →</Text></Pressable> : null}</View></View>}
      {data.kind === 'sale' && shop ? <View style={[styles.card, styles.shopCard]}><Text style={styles.shopName}>{shop.name}</Text>{shop.address ? <Text style={styles.meta}>{shop.address}</Text> : null}{shop.phone || shop.email ? <Text style={styles.meta}>{[shop.phone, shop.email].filter(Boolean).join(' · ')}</Text> : null}{data.gst?.sellerGstin ? <Text style={styles.meta}>GSTIN {data.gst.sellerGstin}{data.gst.sellerStateCode ? ` · ${stateLabel(data.gst.sellerStateCode)}` : ''}</Text> : null}</View> : null}
      <View style={styles.card}><Text style={styles.caption}>{identity.caption}</Text><Text selectable style={styles.identifier}>{identifier}</Text>{identity.note ? <Text style={styles.meta}>{identity.note}</Text> : null}<Text style={styles.meta}>{formatDate(data.date)} · {data.syncState ? 'Provisional' : 'Saved'} {data.kind}</Text>{taxed && data.gst && data.gst.taxType !== 'UNREGISTERED' && data.gst.placeOfSupply ? <Text style={styles.meta}>Place of supply · {stateLabel(data.gst.placeOfSupply)}</Text> : null}</View>
      <View style={[styles.card, styles.contact]}><View style={styles.contactIcon}><Ionicons name={data.kind === 'sale' ? 'person-outline' : 'cube-outline'} size={22} color="#176B50" /></View><View style={{ flex: 1 }}><Text style={styles.meta}>{data.kind === 'sale' ? 'Customer' : 'Supplier'}</Text><Text style={styles.bold}>{data.contact}</Text>{data.gst?.buyerGstin ? <Text style={styles.meta}>GSTIN {data.gst.buyerGstin}</Text> : null}</View></View>
      <Text style={styles.section}>{data.kind === 'sale' ? 'Items' : 'Received items'} · {data.items.length}</Text>
      {data.items.map((item) => (
        <View key={item.id} style={[styles.card, styles.productCard]}>
          <View style={styles.row}>
            <Text style={[styles.bold, styles.productName]}>{item.name}</Text>
            <Text style={styles.bold}>
              {item.price == null ? 'Restricted' : money(Number(item.lineTotal ?? (item.quantity * item.price).toFixed(2)))}
            </Text>
          </View>
          <Text style={styles.meta}>
            {item.sku ? `${item.sku} · ` : ''}{item.hsnCode ? `HSN ${item.hsnCode} · ` : ''}{item.unit ? formatQuantity(item.quantity, item.unit) : `${item.quantity} ${item.label}`}{item.price == null ? '' : ` × ${money(item.price)}`}
          </Text>
          {taxed && item.taxAmount != null ? (
            <Text style={styles.meta}>{lineTaxText(item, data.gst?.taxType)}</Text>
          ) : null}
          {item.stockAfter !== undefined ? (
            <Text style={styles.greenCopy}>{data.kind === 'sale' ? 'Stock remaining' : 'Stock after receipt'}: {formatQuantity(Math.max(0, item.stockAfter), item.stockUnit ?? 'PIECE')}</Text>
          ) : null}
        </View>
      ))}
      <View style={styles.card}>{data.subtotal != null ? <View style={styles.row}><Text style={styles.meta}>{taxed ? 'Subtotal · excluding GST' : 'Subtotal'}</Text><Text style={styles.bold}>{money(Number(data.subtotal))}</Text></View> : null}{Number(data.discountTotal ?? 0) > 0 ? <View style={styles.row}><Text style={styles.meta}>Discount{Number(data.discountPercent ?? 0) > 0 ? ` (${Number(data.discountPercent)}%)` : ''}{taxed ? ' · before GST' : ''}</Text><Text style={styles.bold}>−{money(Number(data.discountTotal))}</Text></View> : null}{taxRows.map((row) => <View key={row.key} style={styles.row}><Text style={styles.meta}>{row.key === 'gst' ? 'GST · saved item rates' : row.label}</Text><Text style={styles.bold}>{money(row.amount)}</Text></View>)}{!taxed && data.total != null ? <Text style={styles.meta}>No GST charged on this {data.kind}.</Text> : null}<View style={styles.row}><Text style={styles.meta}>Total amount</Text><Text style={styles.total}>{total}</Text></View></View>
      <View style={styles.card}><Text style={styles.meta}>Payment status</Text><Text style={styles.bold}>{cancelled ? (refunded > 0 ? `Cancelled · ${money(refunded)} refunded` : 'Cancelled · nothing was paid') : balance == null ? 'Payment history not confirmed' : balance === 0 ? 'Fully paid' : Number(data.amountPaid) === 0 ? 'Full credit · No payment recorded' : 'Partial payment'}</Text>{balance != null ? <><View style={styles.row}><Text style={styles.meta}>Amount {data.kind === 'sale' ? 'received' : 'paid'}</Text><Text style={styles.bold}>{money(Number(data.amountPaid))}</Text></View><View style={styles.row}><Text style={styles.meta}>{data.kind === 'sale' ? 'To collect' : 'To pay'}</Text><Text style={styles.greenTitle}>{money(balance)}</Text></View></> : null}{data.dueDate ? <View style={styles.row}><Text style={styles.meta}>Due {data.dueDate.slice(0, 10)}</Text><Text style={[styles.greenTitle, overdue && { color: '#A74737' }]}>{overdue ? 'Overdue' : balance === 0 ? 'Settled' : 'Not overdue'}</Text></View> : null}{!data.syncState && !cancelled && onPayment && balance !== 0 ? <Pressable accessibilityRole="button" onPress={onPayment} style={styles.secondary}><Text style={styles.buttonText}>Record payment</Text></Pressable> : null}</View>
      {data.payments?.length ? <View style={styles.card}><Text style={styles.bold}>Payment history</Text>{data.payments.map((payment) => <View key={payment.id} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.meta}>{payment.kind === 'OPENING_BALANCE' ? 'Confirmed prior balance' : payment.kind === 'REFUND' ? `Refund · ${paymentMethodLabel(payment.method)}` : paymentMethodLabel(payment.method)}</Text><Text style={styles.meta}>{formatDate(payment.paidAt)}</Text></View><Text style={styles.bold}>{payment.kind === 'REFUND' ? '−' : ''}{money(Number(payment.amount))}</Text></View>)}</View> : null}
      {methods ? <View style={styles.card}><Text style={styles.meta}>{methods.includes(' + ') ? 'Payment methods' : 'Payment method'}</Text><Text style={styles.bold}>{methods}</Text></View> : null}
      {data.note ? <View style={styles.card}><Text style={styles.meta}>Note</Text><Text style={styles.bold}>{data.note}</Text></View> : null}
      {data.items.some((item) => item.stockAfter !== undefined) ? <View style={styles.stock}><Text style={styles.greenTitle}>{data.syncState ? 'Stock adjusted on this device' : 'Stock updated'} for this {data.kind}</Text>{data.items.map((item) => item.stockAfter !== undefined ? <View key={item.id} style={styles.row}><Text style={[styles.meta, { flex: 1 }]}>{item.name}</Text><Text style={styles.greenTitle}>{formatQuantity(Math.max(0, item.stockAfter), item.stockUnit ?? 'PIECE')}</Text></View> : null)}</View> : null}
    <SaleReferencePhoto value={data.referenceImage} />
      {mayCancel ? <Pressable accessibilityRole="button" onPress={() => setCancelling(true)} style={styles.cancelLink}><Text style={styles.cancelLinkText}>Cancel this {data.kind}</Text></Pressable> : null}
      <PurchaseAttachment value={data.attachment} />
      </ScrollView>
    {cancelling ? <CancelBillModal kind={data.kind} id={data.id} number={identifier} paid={Number(data.amountPaid ?? 0)} paidMethod={[...(data.payments ?? [])].reverse().find((payment) => payment.kind === 'PAYMENT')?.method ?? data.paymentMethod} onClose={() => setCancelling(false)} onCancelled={(record) => { setCancelling(false); setData((current) => ({ ...current, status: record.status, cancelReason: record.cancelReason, cancelledAt: record.cancelledAt, amountPaid: record.amountPaid, payments: record.payments })); }} /> : null}
    <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <View style={styles.actions}>
        {data.syncState ? (
          <Pressable accessibilityRole="button" disabled accessibilityState={{ disabled: true }} style={[styles.secondary, { opacity: 0.45 }]}><Text style={styles.buttonText}>Print and share after sync</Text></Pressable>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={`Print ${heading.toLowerCase()}`} disabled={!!preparing} accessibilityState={{ disabled: !!preparing, busy: preparing === 'print' }} onPress={() => void runDocument('print')} style={[styles.secondary, !!preparing && { opacity: 0.6 }]}><Text style={styles.buttonText}>{preparing === 'print' ? 'Opening…' : 'Print'}</Text></Pressable>
            {canSharePdf ? <Pressable accessibilityRole="button" accessibilityLabel={`Share ${heading.toLowerCase()} as PDF`} disabled={!!preparing} accessibilityState={{ disabled: !!preparing, busy: preparing === 'pdf' }} onPress={() => void runDocument('pdf')} style={[styles.secondary, !!preparing && { opacity: 0.6 }]}><Text style={styles.buttonText}>{preparing === 'pdf' ? 'Preparing PDF…' : 'Share PDF'}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.secondary}><Text style={styles.buttonText}>{data.kind === 'sale' ? 'Share on WhatsApp' : 'Share as text'}</Text></Pressable>
          </>
        )}
      </View>
      {mayCreate ? <View style={styles.actions}><Pressable accessibilityRole="button" onPress={onNew} style={styles.primary}><Text style={styles.primaryText}>Start new {data.kind}</Text></Pressable>{onRepeat && !data.syncState ? <Pressable accessibilityRole="button" onPress={onRepeat} style={styles.secondary}><Text style={styles.buttonText}>Repeat sale</Text></Pressable> : null}</View> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  cancelledBanner: { backgroundColor: '#FBEAE7' }, cancelLink: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8 }, cancelLinkText: { color: '#A74737', fontSize: 14, fontWeight: '700' },
  screen: { flex: 1, backgroundColor: '#F3F5F4' }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, minHeight: 64, backgroundColor: '#FFFFFF' }, back: { minHeight: 44, minWidth: 32, justifyContent: 'center' }, title: { color: '#24332A', fontSize: 24, fontWeight: '800' }, content: { padding: 20, width: '100%', maxWidth: 680, alignSelf: 'center' },
  productCard: { backgroundColor: '#EDF5F0', borderColor: '#CFDFD5', borderLeftWidth: 4, borderLeftColor: '#80AB94', padding: 10, marginBottom: 8, gap: 3 },
  productName: { flex: 1, minWidth: 0 },
  shopCard: { gap: 2 }, shopName: { color: '#24332A', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6E2', borderRadius: 15, padding: 16, marginBottom: 16, gap: 8 }, success: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 13, backgroundColor: '#E7F2ED', marginBottom: 16 }, greenTitle: { color: '#176B50', fontWeight: '700', fontSize: 13 }, greenCopy: { color: '#176B50', fontSize: 12, lineHeight: 18, marginTop: 4 }, meta: { color: '#737B77', fontSize: 12, lineHeight: 18 }, caption: { color: '#737B77', fontSize: 10, letterSpacing: 0.4 }, identifier: { color: '#24332A', fontSize: 22, fontWeight: '800' }, bold: { flexShrink: 1, color: '#24332A', fontSize: 14, fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, contact: { flexDirection: 'row', alignItems: 'center', gap: 12 }, contactIcon: { padding: 10, backgroundColor: '#E7F2ED', borderRadius: 10 }, section: { color: '#24332A', fontSize: 17, fontWeight: '700', marginBottom: 14 }, total: { color: '#176B50', fontSize: 25, fontWeight: '800', flexShrink: 1 }, stock: { padding: 16, borderRadius: 14, backgroundColor: '#E7F2ED', gap: 12, marginBottom: 8 }, footer: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E1E7E3', gap: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, secondary: { alignSelf: 'flex-start', flexShrink: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DEE6E1', borderRadius: 10 }, buttonText: { textAlign: 'center', flexShrink: 1, color: '#176B50', fontSize: 14, fontWeight: '700' }, primary: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#176B50' }, primaryText: { textAlign: 'center', flexShrink: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' }, error: { padding: 12, color: '#A74737' },
});
