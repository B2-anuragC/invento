import { RecordPaymentModal } from '@/components/record-payment-modal';
import { paymentBalance, isOverdue } from '@/services/transaction-accounting';
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, AppScreen, appColors } from '@/components/invento-ui';
import {
  appSession,
  fetchPricingAccess,
  fetchCustomer,
  fetchPurchases,
  fetchSales,
  fetchSupplier,
  updateCustomer,
  updateSupplier,
  type CustomerRecord,
  type PurchaseRecord,
  type SaleRecord,
  type SupplierRecord,
} from '@/services/api';

type Contact = CustomerRecord | SupplierRecord;

export default function ContactDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const contactKind = kind === 'suppliers' ? 'suppliers' : 'customers';
  const [contact, setContact] = useState<Contact | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', email: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SaleRecord | PurchaseRecord | null>(null);
  const [error, setError] = useState('');

  const loadDetails = useCallback(() => {
    const session = appSession.current;
    if (!session || !id) {
      setError('Sign in to view this contact.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const contactRequest = contactKind === 'customers'
      ? fetchCustomer(session, id)
      : fetchSupplier(session, id);
    Promise.all([
      contactRequest,
      contactKind === 'customers' ? fetchSales(session, { customerId: id }) : fetchPurchases(session, { supplierId: id }),
      fetchPricingAccess(session),
    ])
      .then(([record, history, access]) => {
        const loaded = record as Contact;
        setContact(loaded);
        setForm({
          name: loaded.name,
          contactName: loaded.contactName ?? '',
          phone: loaded.phone ?? '',
          email: loaded.email ?? '',
          address: loaded.address ?? '',
        });
        if (contactKind === 'customers') setSales(history as SaleRecord[]);
        else setPurchases(history as PurchaseRecord[]);
        setCanEdit(access.role === 'OWNER' || access.role === 'ADMIN');
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load contact details.'))
      .finally(() => setLoading(false));
  }, [contactKind, id]);

  useFocusEffect(useCallback(() => { loadDetails(); }, [loadDetails]));

  const saveContact = async () => {
    const session = appSession.current;
    if (!session || !contact || !form.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const input = {
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      };
      const updated = contactKind === 'customers'
        ? await updateCustomer(session, contact.id, input)
        : await updateSupplier(session, contact.id, input);
      setContact(updated);
      setEditing(false);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save contact.');
    } finally {
      setSaving(false);
    }
  };

  const history = contactKind === 'customers' ? sales : purchases;
  const total = contactKind === 'customers'
    ? sales.reduce((sum, item) => sum + Number(item.total), 0)
    : purchases.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  const purchaseTotalsHidden = contactKind === 'suppliers' && purchases.some((item) => item.total == null);

  const openPhone = async (action: 'tel' | 'whatsapp') => {
    if (!contact?.phone) return;
    setError('');
    if (action === 'tel') {
      await Linking.openURL(`tel:${contact.phone.replace(/[^+\d]/g, '')}`).catch(() => setError('Could not open the phone app.'));
      return;
    }
    const raw = contact.phone.trim();
    let phone = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) phone = phone.slice(2);
    // Local Indian mobile numbers use the app's default country code.
    if (!raw.startsWith('+') && !raw.startsWith('00')) {
      if (/^0[6-9]\d{9}$/.test(phone)) phone = phone.slice(1);
      if (/^[6-9]\d{9}$/.test(phone)) phone = `91${phone}`;
    }
    if (!/^[1-9]\d{6,14}$/.test(phone)) {
      setError('Enter a valid WhatsApp phone number including its country code.');
      return;
    }
    const webUrl = `https://wa.me/${phone}`;
    if (Platform.OS === 'web') {
      await Linking.openURL(webUrl).catch(() => setError('Could not open WhatsApp.'));
      return;
    }
    try {
      await Linking.openURL(`whatsapp://send?phone=${phone}`);
    } catch {
      await Linking.openURL(webUrl).catch(() => setError('Could not open WhatsApp. Check that it is installed.'));
    }
  };

  const knownBalances = history.map((record) => paymentBalance(record));
  const outstanding = knownBalances.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const unknownPayments = knownBalances.some((value) => value === null);
  const recordableTransactions = history.filter((record) => record.total != null && paymentBalance(record) !== 0);
  const paymentModal = paymentTarget && paymentTarget.total != null ? <RecordPaymentModal kind={contactKind === 'customers' ? 'sale' : 'purchase'} id={paymentTarget.id} total={paymentTarget.total} amountPaid={paymentTarget.amountPaid} onClose={() => setPaymentTarget(null)} onSaved={() => { setPaymentTarget(null); loadDetails(); }} /> : null;
  if (contactKind === 'customers' && contact && !loading && !editing) {
    const latestSale = [...sales].sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())[0];
    return (
      <AppScreen style={customerStyles.screen}>
        <View style={customerStyles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to People" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/people')}><Ionicons name="arrow-back" size={26} color="#1C2D26" /></Pressable>
          <Text style={customerStyles.heading}>Customer details</Text>
          {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="Edit customer" onPress={() => setEditing(true)} style={customerStyles.edit}><Ionicons name="pencil-outline" size={21} color="#1C2D26" /></Pressable> : null}
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={customerStyles.content}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={customerStyles.card}>
            <View style={customerStyles.row}>
              <View style={customerStyles.avatar}><Ionicons name="person-outline" size={22} color="#176344" /></View>
              <View style={customerStyles.copy}>
                <Text style={customerStyles.meta}>Customer</Text>
                <Text style={customerStyles.name}>{contact.name}</Text>
                <Text style={customerStyles.meta}>{[contact.phone, contact.address].filter(Boolean).join(' · ') || 'No contact details'}</Text>
                {contact.contactName ? <Text style={customerStyles.meta}>{contact.contactName}</Text> : null}
                {contact.email ? <Text style={customerStyles.meta}>{contact.email}</Text> : null}
              </View>
            </View>
            <View style={customerStyles.actions}>
              {(['tel', 'whatsapp'] as const).map((scheme) => <Pressable key={scheme} accessibilityRole="button" accessibilityState={{ disabled: !contact.phone }} disabled={!contact.phone} onPress={() => void openPhone(scheme)} style={[customerStyles.button, customerStyles.contactButton, !contact.phone && customerStyles.disabled]}><Ionicons name={scheme === 'tel' ? 'call-outline' : 'logo-whatsapp'} size={18} color="#176344" /><Text style={customerStyles.buttonText}>{scheme === 'tel' ? 'Call' : 'WhatsApp'}</Text></Pressable>)}
            </View>
          </View>
          <View style={customerStyles.summary}>
            <Text style={customerStyles.summaryLabel}>OUTSTANDING · TO COLLECT</Text>
            <Text style={customerStyles.summaryValue}>{formatMoney(outstanding)}{unknownPayments ? ' + unconfirmed' : ''}</Text>
            <Text style={customerStyles.summaryMeta}>{latestSale ? `Latest sale ${formatDate(latestSale.saleDate)}` : 'No sales recorded'}</Text>
            <View style={customerStyles.divider} />
            <View style={customerStyles.between}><Text style={customerStyles.meta}>Saved sales</Text><Text style={customerStyles.name}>{sales.length}</Text></View>
            <Text style={customerStyles.meta}>{unknownPayments ? 'Some historical payments need confirmation. Open a receipt to confirm prior payments.' : 'Based on recorded payments.'}</Text>
          </View>
          <View style={customerStyles.between}><Text style={customerStyles.sectionTitle}>Transaction history</Text><Text style={customerStyles.link}>All transactions</Text></View>
          {!sales.length ? <Text style={styles.empty}>No transactions linked to this customer yet.</Text> : null}
          {[...sales].sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()).map((sale) => (
            <Pressable key={sale.id} accessibilityRole="button" accessibilityLabel={`View invoice ${sale.invoiceNumber || sale.id}`} onPress={() => router.push(`/sale/${sale.id}`)} style={customerStyles.card}>
              <View style={customerStyles.between}><Text style={customerStyles.name}>{sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`}</Text><Text style={customerStyles.badge}>Saved</Text></View>
              <Text style={customerStyles.meta}>Sale · {formatDate(sale.saleDate)} · {sale.items.length} items</Text>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>Payment method</Text><Text style={customerStyles.name}>{sale.paymentMethod.replaceAll('_', ' ')}</Text></View>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>Invoice total</Text><Text style={customerStyles.link}>{formatMoney(Number(sale.total))}</Text></View>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>To collect</Text><Text style={customerStyles.link}>{paymentBalance(sale) == null ? 'Not confirmed' : formatMoney(paymentBalance(sale)!)}</Text></View>{sale.dueDate ? <Text style={[customerStyles.meta, isOverdue(sale) && { color: '#A74737' }]}>Due {sale.dueDate.slice(0, 10)} · {isOverdue(sale) ? 'Overdue' : 'Not overdue'}</Text> : null}
              {canEdit && sale.total != null && paymentBalance(sale) !== 0 ? <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); setPaymentTarget(sale); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={customerStyles.link}>Record payment</Text></Pressable> : null}
              <View style={customerStyles.divider} />
              <View style={customerStyles.row}><Ionicons name="receipt-outline" size={19} color="#176344" /><Text style={[customerStyles.link, customerStyles.copy]}>View invoice / receipt</Text><Ionicons name="chevron-forward" size={22} color="#176344" /></View>
            </Pressable>
          ))}
        </ScrollView>
        {canEdit ? <View style={[customerStyles.footer, { paddingBottom: 16 + insets.bottom }]}>
          <View style={customerStyles.actions}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/sale/create?customerId=${encodeURIComponent(contact.id)}`)} style={[customerStyles.button, customerStyles.primary]}><Ionicons name="add" size={24} color="white" /><Text style={customerStyles.primaryText}>New sale</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !latestSale }} disabled={!latestSale} onPress={() => latestSale && router.push(`/sale/create?saleId=${encodeURIComponent(latestSale.id)}`)} style={[customerStyles.button, !latestSale && customerStyles.disabled]}><Ionicons name="refresh" size={18} color="#176344" /><Text style={customerStyles.buttonText}>Repeat sale</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !recordableTransactions.length }} disabled={!recordableTransactions.length} onPress={() => setPaymentTarget(recordableTransactions[0])} style={[customerStyles.button, customerStyles.paymentButton, !recordableTransactions.length && customerStyles.disabled]}><Text style={customerStyles.buttonText}>Record payment</Text></Pressable>
        </View> : null}
        {paymentModal}
      </AppScreen>
    );
  }

  if (contactKind === 'suppliers' && contact && !loading && !editing) {
    const latestPurchase = [...purchases].sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
    return (
      <AppScreen style={customerStyles.screen}>
        <View style={customerStyles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to People" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/people')}><Ionicons name="arrow-back" size={26} color="#1C2D26" /></Pressable>
          <Text style={customerStyles.heading}>Supplier details</Text>
          {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="Edit supplier" onPress={() => setEditing(true)} style={customerStyles.edit}><Ionicons name="pencil-outline" size={21} color="#1C2D26" /></Pressable> : null}
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={customerStyles.content}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={customerStyles.card}>
            <View style={customerStyles.row}>
              <View style={customerStyles.avatar}><Ionicons name="cube-outline" size={22} color="#176344" /></View>
              <View style={customerStyles.copy}>
                <Text style={customerStyles.meta}>Supplier</Text>
                <Text style={customerStyles.name}>{contact.name}</Text>
                <Text style={customerStyles.meta}>{[contact.phone, contact.address].filter(Boolean).join(' · ') || 'No contact details'}</Text>
                {contact.contactName ? <Text style={customerStyles.meta}>{contact.contactName}</Text> : null}
                {contact.email ? <Text style={customerStyles.meta}>{contact.email}</Text> : null}
              </View>
            </View>
            <View style={customerStyles.actions}>
              {(['tel', 'whatsapp'] as const).map((scheme) => <Pressable key={scheme} accessibilityRole="button" accessibilityState={{ disabled: !contact.phone }} disabled={!contact.phone} onPress={() => void openPhone(scheme)} style={[customerStyles.button, customerStyles.contactButton, !contact.phone && customerStyles.disabled]}><Ionicons name={scheme === 'tel' ? 'call-outline' : 'logo-whatsapp'} size={18} color="#176344" /><Text style={customerStyles.buttonText}>{scheme === 'tel' ? 'Call' : 'WhatsApp'}</Text></Pressable>)}
            </View>
          </View>
          <View style={customerStyles.summary}>
            <Text style={customerStyles.summaryLabel}>OUTSTANDING · TO PAY</Text>
            <Text style={customerStyles.summaryValue}>{purchaseTotalsHidden ? 'Restricted price' : formatMoney(outstanding)}{!purchaseTotalsHidden && unknownPayments ? ' + unconfirmed' : ''}</Text>
            <Text style={customerStyles.summaryMeta}>{latestPurchase ? `Latest purchase ${formatDate(latestPurchase.purchaseDate)}` : 'No purchases recorded'}</Text>
            <View style={customerStyles.divider} />
            <View style={customerStyles.between}><Text style={customerStyles.meta}>Saved purchases</Text><Text style={customerStyles.name}>{purchases.length}</Text></View>
            <Text style={customerStyles.meta}>{unknownPayments ? 'Some historical payments need confirmation. Open a receipt to confirm prior payments.' : 'Based on recorded payments.'}</Text>
          </View>
          <View style={customerStyles.between}><Text style={customerStyles.sectionTitle}>Transaction history</Text><Text style={customerStyles.link}>All transactions</Text></View>
          {!purchases.length ? <Text style={styles.empty}>No transactions linked to this supplier yet.</Text> : null}
          {[...purchases].sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()).map((purchase) => (
            <Pressable key={purchase.id} accessibilityRole="button" accessibilityLabel={`View purchase ${purchase.invoiceNumber || purchase.id}`} onPress={() => router.push(`/purchase/${purchase.id}`)} style={customerStyles.card}>
              <View style={customerStyles.between}><Text style={customerStyles.name}>{purchase.invoiceNumber || `Purchase ${purchase.id.slice(-8).toUpperCase()}`}</Text><Text style={customerStyles.badge}>Saved</Text></View>
              <Text style={customerStyles.meta}>Purchase · {formatDate(purchase.purchaseDate)} · {purchase.items.length} items</Text>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>Supplier invoice</Text><Text style={customerStyles.name}>{purchase.invoiceNumber || 'Not provided'}</Text></View>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>Purchase total</Text><Text style={customerStyles.link}>{purchase.total == null ? 'Restricted price' : formatMoney(Number(purchase.total))}</Text></View>
              <View style={customerStyles.between}><Text style={customerStyles.meta}>To pay</Text><Text style={customerStyles.link}>{paymentBalance(purchase) == null ? 'Not confirmed' : formatMoney(paymentBalance(purchase)!)}</Text></View>{purchase.dueDate ? <Text style={[customerStyles.meta, isOverdue(purchase) && { color: '#A74737' }]}>Due {purchase.dueDate.slice(0, 10)} · {isOverdue(purchase) ? 'Overdue' : 'Not overdue'}</Text> : null}
              {canEdit && purchase.total != null && paymentBalance(purchase) !== 0 ? <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); setPaymentTarget(purchase); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={customerStyles.link}>Record payment</Text></Pressable> : null}
              <View style={customerStyles.divider} />
              <View style={customerStyles.row}><Ionicons name="receipt-outline" size={19} color="#176344" /><Text style={[customerStyles.link, customerStyles.copy]}>View purchase receipt</Text><Ionicons name="chevron-forward" size={22} color="#176344" /></View>
            </Pressable>
          ))}
        </ScrollView>
        {canEdit ? <View style={[customerStyles.footer, { paddingBottom: 16 + insets.bottom }]}>
          <View style={customerStyles.actions}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/purchase/create?supplierId=${encodeURIComponent(contact.id)}`)} style={[customerStyles.button, customerStyles.primary]}><Ionicons name="add" size={24} color="white" /><Text style={customerStyles.primaryText}>New purchase</Text></Pressable>

          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !recordableTransactions.length }} disabled={!recordableTransactions.length} onPress={() => setPaymentTarget(recordableTransactions[0])} style={[customerStyles.button, customerStyles.paymentButton, !recordableTransactions.length && customerStyles.disabled]}><Text style={customerStyles.buttonText}>Record payment</Text></Pressable>
        </View> : null}
        {paymentModal}
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 36 + insets.bottom }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to People" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/people')} style={styles.back}><Text style={styles.backText}>‹  People</Text></Pressable>
        {loading ? <ActivityIndicator color={appColors.primary} style={styles.state} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && contact ? (
          <>
            <Text style={styles.eyebrow}>{contactKind === 'customers' ? 'CUSTOMER PROFILE' : 'SUPPLIER PROFILE'}</Text>
            <View style={styles.hero}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase()}</Text></View>
              {editing ? (
                <View style={styles.form}>
                  {([
                    ['name', 'Business name'],
                    ['contactName', 'Contact person'],
                    ['phone', 'Phone'],
                    ['email', 'Email'],
                    ['address', 'Address'],
                  ] as const).map(([key, label]) => (
                    <View key={key}>
                      <Text style={styles.label}>{label}</Text>
                      <TextInput
                        value={form[key]}
                        onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
                        style={styles.input}
                        placeholder={label}
                        placeholderTextColor="#89918C"
                        autoCapitalize={key === 'email' ? 'none' : 'words'}
                        keyboardType={key === 'phone' ? 'phone-pad' : key === 'email' ? 'email-address' : 'default'}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <>
                  <Text style={styles.name}>{contact.name}</Text>
                  <Text style={styles.subtitle}>{contact.contactName || (contactKind === 'customers' ? 'Customer' : 'Supplier')}</Text>
                  <Text style={styles.contactInfo}>{contact.phone || 'No phone number'}</Text>
                  {contact.email ? <Text style={styles.contactInfo}>{contact.email}</Text> : null}
                  {contact.address ? <Text style={styles.contactInfo}>{contact.address}</Text> : null}
                  <View style={customerStyles.actions}>
                    {(['tel', 'whatsapp'] as const).map((action) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={action === 'tel' ? 'Call supplier' : 'Open supplier chat in WhatsApp'} accessibilityState={{ disabled: !contact.phone }} disabled={!contact.phone} onPress={() => void openPhone(action)} style={[customerStyles.button, customerStyles.contactButton, !contact.phone && customerStyles.disabled]}><Ionicons name={action === 'tel' ? 'call-outline' : 'logo-whatsapp'} size={18} color="#176344" /><Text style={customerStyles.buttonText}>{action === 'tel' ? 'Call' : 'WhatsApp'}</Text></Pressable>)}
                  </View>
                </>
              )}
              {canEdit ? (
                editing ? (
                  <View style={styles.editActions}>
                    <ActionButton title={saving ? 'Saving…' : 'Save changes'} onPress={() => void saveContact()} disabled={saving || !form.name.trim()} />
                    <ActionButton title="Cancel" variant="secondary" onPress={() => setEditing(false)} disabled={saving} />
                  </View>
                ) : (
                  <Pressable onPress={() => setEditing(true)} style={styles.editButton}><Text style={styles.editText}>Edit contact</Text></Pressable>
                )
              ) : null}
            </View>

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{history.length}</Text>
                <Text style={styles.metricLabel}>{contactKind === 'customers' ? 'Sales' : 'Purchases'}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{purchaseTotalsHidden ? 'Hidden' : formatMoney(total)}</Text>
                <Text style={styles.metricLabel}>{contactKind === 'customers' ? 'Total value' : 'Spend recorded'}</Text>
              </View>
            </View>

            <View style={styles.historyHeading}>
              <Text style={styles.sectionTitle}>{contactKind === 'customers' ? 'Sales history' : 'Purchase history'}</Text>
              <Text style={styles.historyCount}>{history.length} entries</Text>
            </View>
            {!history.length ? <Text style={styles.empty}>No transactions linked to this contact yet.</Text> : null}
            {contactKind === 'customers' ? sales.map((sale) => (
              <Pressable key={sale.id} accessibilityRole="button" accessibilityLabel="View sale details" onPress={() => router.push(`/sale/${sale.id}`)} style={styles.historyCard}>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle}>{sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={styles.historyMeta}>{new Date(sale.saleDate).toLocaleDateString([], { dateStyle: 'medium' })} · {sale.items.length} items</Text>
                </View>
                <Text style={styles.historyAmount}>{formatMoney(Number(sale.total))} ›</Text>
              </Pressable>
            )) : purchases.map((purchase) => (
              <Pressable key={purchase.id} accessibilityRole="button" accessibilityLabel="View purchase details" onPress={() => router.push(`/purchase/${purchase.id}`)} style={styles.historyCard}>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle}>{purchase.invoiceNumber || `Purchase ${purchase.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={styles.historyMeta}>{new Date(purchase.purchaseDate).toLocaleDateString([], { dateStyle: 'medium' })} · {purchase.items.length} items</Text>
                </View>
                <Text style={styles.purchaseAmount}>{purchase.total == null ? 'Restricted' : formatMoney(Number(purchase.total))} ›</Text>
              </Pressable>
            ))}
            {canEdit ? (
              <Pressable
                onPress={() => {
                  if (contactKind === 'customers') router.push(`/sale/create?customerId=${encodeURIComponent(contact.id)}`);
                  else router.push(`/purchase/create?supplierId=${encodeURIComponent(contact.id)}`);
                }}
                style={styles.newTransaction}>
                <Text style={styles.newTransactionText}>＋ New {contactKind === 'customers' ? 'sale' : 'purchase'}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  back: { alignSelf: 'stretch', marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 17, marginBottom: 12, backgroundColor: '#FFFFFF' },
  backText: { color: '#24332A', fontSize: 18, fontWeight: '700' },
  eyebrow: { color: '#557267', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 12 },
  state: { marginVertical: 28 },
  error: { color: '#A74737', backgroundColor: '#F6E9E6', padding: 12, borderRadius: 12, fontSize: 12 },
  hero: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E1E1E1', borderWidth: 1, borderRadius: 17, padding: 20 },
  avatar: { width: 68, height: 68, borderRadius: 23, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  avatarText: { color: '#176B50', fontSize: 27, fontWeight: '800' },
  name: { color: '#1B2921', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#176B50', fontSize: 12, fontWeight: '700', marginTop: 5 },
  contactInfo: { color: '#78837C', fontSize: 12, marginTop: 6, textAlign: 'center' },
  form: { width: '100%', gap: 3 },
  label: { color: '#56645C', fontSize: 11, fontWeight: '700', marginTop: 9, marginBottom: 5 },
  input: { minHeight: 43, backgroundColor: '#F7F9F7', borderWidth: 1, borderColor: '#E0E7E1', borderRadius: 11, paddingHorizontal: 11, color: '#17241E', fontSize: 13 },
  editButton: { marginTop: 15, borderRadius: 11, backgroundColor: '#E8F2EC', paddingHorizontal: 15, paddingVertical: 10 },
  editText: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  editActions: { width: '100%', gap: 9, marginTop: 14 },
  metrics: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F2EC', borderRadius: 17, paddingVertical: 17, marginTop: 14 },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#176B50', fontSize: 17, fontWeight: '800' },
  metricLabel: { color: '#65766B', fontSize: 10, marginTop: 4 },
  metricDivider: { width: 1, height: 36, backgroundColor: '#CADACF' },
  historyHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: '#1B2921', fontSize: 18, fontWeight: '800' },
  historyCount: { color: '#849088', fontSize: 11 },
  empty: { color: '#78837C', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 17, textAlign: 'center', fontSize: 12 },
  historyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9E4', borderRadius: 14, padding: 13, marginBottom: 8 },
  historyCopy: { flex: 1, minWidth: 0 },
  historyTitle: { color: '#26362E', fontSize: 13, fontWeight: '800' },
  historyMeta: { color: '#78837C', fontSize: 10, marginTop: 4 },
  historyAmount: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  purchaseAmount: { color: '#96621B', fontSize: 12, fontWeight: '800' },
  newTransaction: { marginTop: 16, minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C7253', borderRadius: 13 },
  newTransactionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const customerStyles = StyleSheet.create({
  screen: { backgroundColor: '#F3F5F4' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 20, minHeight: 76, backgroundColor: '#FFFFFF' },
  heading: { flex: 1, color: '#1C2D26', fontSize: 22, fontWeight: '700' },
  edit: { padding: 10, borderRadius: 10, backgroundColor: '#F3F5F4' },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  card: { flexShrink: 0, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E1E7E3', padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  avatar: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#E8F3EC', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#1C2D26', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  meta: { color: '#74827B', fontSize: 11, lineHeight: 16 },
  actions: { width: '100%', minHeight: 50, flexShrink: 0, flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  button: { flexGrow: 1, flexBasis: 0, minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: '#E1E7E3', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  contactButton: { height: 50, flexShrink: 0 },
  buttonText: { color: '#176344', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  summary: { padding: 18, borderRadius: 14, backgroundColor: '#E8F3EC', gap: 12 },
  summaryLabel: { color: '#176344', fontSize: 12, fontWeight: '600' },
  summaryValue: { color: '#124B35', fontSize: 36, fontWeight: '700' },
  summaryMeta: { color: '#176344', fontSize: 11 },
  divider: { height: 1, backgroundColor: '#E1E7E3' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: '#1C2D26', fontSize: 16, fontWeight: '600' },
  link: { color: '#176344', fontSize: 12, fontWeight: '600' },
  badge: { color: '#176344', fontSize: 10, backgroundColor: '#E8F3EC', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  footer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E1E7E3', padding: 16, paddingHorizontal: 20, gap: 12 },
  paymentButton: { flexGrow: 0, flexBasis: 'auto' },
  primary: { backgroundColor: '#176344', borderColor: '#176344' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
