import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDate, formatMoney, formatQuantity } from '@/services/format';
import { taxTotalRows } from '@/services/gst';
import { invoiceFileName, invoiceHtml, type InvoiceShop, type InvoiceSource } from '@/services/invoice-document';
import { canSharePdf, printInvoice, shareInvoicePdf } from '@/services/invoice-print';

/** A credit or debit note on screen, printed or shared as an A4 PDF like an invoice. */
export function ReturnNoteView({ note, shop, onClose }: { note: InvoiceSource; shop: InvoiceShop; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [preparing, setPreparing] = useState<'print' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const sale = note.kind === 'sale';
  const title = sale ? 'Credit note' : 'Debit note';
  const priced = note.total != null;
  const taxRows = priced ? taxTotalRows(note.items, note.gst?.taxType, note.taxTotal ?? 0, note.chargeGst) : [];
  const run = async (action: 'print' | 'pdf') => {
    if (preparing) return;
    setPreparing(action);
    setError('');
    try {
      const html = invoiceHtml(note, shop);
      if (action === 'print') await printInvoice(html);
      else await shareInvoicePdf(html, invoiceFileName(note));
    } catch {
      setError(action === 'print' ? 'Could not open printing. Please try again.' : 'Could not create the PDF. Please try again.');
    } finally {
      setPreparing(null);
    }
  };
  return <Modal animationType="slide" statusBarTranslucent onRequestClose={onClose}><View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={styles.back}><Ionicons name="arrow-back" size={24} color="#24332A" /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text><Text style={styles.meta} numberOfLines={1}>{[shop.name, formatDate(note.date)].filter(Boolean).join(' · ')}</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.card}><Text style={styles.caption}>{title.toUpperCase()} NUMBER</Text><Text selectable style={styles.identifier}>{note.documentNumber}</Text>{note.returnOf ? <Text style={styles.meta}>Against {sale ? 'invoice' : 'purchase'} {note.returnOf.number} · {formatDate(note.returnOf.date)}</Text> : null}<Text style={styles.meta}>{sale ? 'Customer' : 'Supplier'} · {note.contact}</Text></View>
      <Text style={styles.section}>Returned items · {note.items.length}</Text>
      {note.items.map((item) => <View key={item.id} style={[styles.card, styles.item]}>
        <View style={styles.row}><Text style={[styles.bold, { flex: 1 }]}>{item.name}</Text>{priced ? <Text style={styles.bold}>{formatMoney(Number(item.lineTotal ?? 0) - Number(item.discountAmount ?? 0) + Number(item.taxAmount ?? 0))}</Text> : null}</View>
        <Text style={styles.meta}>{item.unit ? formatQuantity(item.quantity, item.unit) : `${item.quantity} ${item.label}`}{priced && item.price != null ? ` × ${formatMoney(item.price)}` : ''}</Text>
      </View>)}
      {priced ? <View style={styles.card}>
        <View style={styles.row}><Text style={styles.meta}>Subtotal</Text><Text style={styles.bold}>{formatMoney(Number(note.subtotal ?? 0))}</Text></View>
        {Number(note.discountTotal ?? 0) > 0 ? <View style={styles.row}><Text style={styles.meta}>Discount share</Text><Text style={styles.bold}>−{formatMoney(Number(note.discountTotal))}</Text></View> : null}
        {taxRows.map((row) => <View key={row.key} style={styles.row}><Text style={styles.meta}>{row.label}</Text><Text style={styles.bold}>{formatMoney(row.amount)}</Text></View>)}
        <View style={styles.row}><Text style={styles.meta}>Total</Text><Text style={styles.total}>{formatMoney(Number(note.total))}</Text></View>
        {note.returnOf?.settlement ? <Text style={styles.meta}>{note.returnOf.settlement}</Text> : null}
      </View> : <View style={styles.card}><Text style={styles.meta}>Prices are hidden for your role.</Text></View>}
      {note.returnOf?.reason ? <View style={styles.card}><Text style={styles.meta}>Reason</Text><Text style={styles.bold}>{note.returnOf.reason}</Text></View> : null}
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Print ${title.toLowerCase()}`} disabled={!!preparing} accessibilityState={{ disabled: !!preparing, busy: preparing === 'print' }} onPress={() => void run('print')} style={[styles.secondary, !!preparing && { opacity: 0.6 }]}><Text style={styles.buttonText}>{preparing === 'print' ? 'Opening…' : 'Print'}</Text></Pressable>
      {canSharePdf ? <Pressable accessibilityRole="button" accessibilityLabel={`Share ${title.toLowerCase()} as PDF`} disabled={!!preparing} accessibilityState={{ disabled: !!preparing, busy: preparing === 'pdf' }} onPress={() => void run('pdf')} style={[styles.secondary, !!preparing && { opacity: 0.6 }]}><Text style={styles.buttonText}>{preparing === 'pdf' ? 'Preparing PDF…' : 'Share PDF'}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.buttonText}>Back to bill</Text></Pressable>
    </View>
  </View></Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F5F4' }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, minHeight: 64, backgroundColor: '#FFFFFF' }, back: { minHeight: 44, minWidth: 32, justifyContent: 'center' }, title: { color: '#24332A', fontSize: 24, fontWeight: '800' },
  content: { padding: 20, width: '100%', maxWidth: 680, alignSelf: 'center' }, card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6E2', borderRadius: 15, padding: 16, marginBottom: 16, gap: 8 }, item: { backgroundColor: '#FBF3E8', borderColor: '#EBD9BF', borderLeftWidth: 4, borderLeftColor: '#C08A3E', padding: 10, marginBottom: 8, gap: 3 },
  caption: { color: '#737B77', fontSize: 10, letterSpacing: 0.4 }, identifier: { color: '#24332A', fontSize: 22, fontWeight: '800' }, meta: { color: '#737B77', fontSize: 12, lineHeight: 18 }, bold: { flexShrink: 1, color: '#24332A', fontSize: 14, fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, section: { color: '#24332A', fontSize: 17, fontWeight: '700', marginBottom: 14 }, total: { color: '#176B50', fontSize: 25, fontWeight: '800', flexShrink: 1 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E1E7E3' }, secondary: { flexShrink: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DEE6E1', borderRadius: 10 }, buttonText: { textAlign: 'center', color: '#176B50', fontSize: 14, fontWeight: '700' }, error: { padding: 12, color: '#A74737' },
});
