import { useCallback, useState } from 'react';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  People</Text></Pressable>
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
                </>
              )}
              {canEdit ? (
                editing ? (
                  <View style={styles.editActions}>
                    <ActionButton title={saving ? 'Saving…' : 'Save changes'} onPress={() => void saveContact()} />
                    <ActionButton title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
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
              <View key={sale.id} style={styles.historyCard}>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle}>{sale.invoiceNumber || `Sale ${sale.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={styles.historyMeta}>{new Date(sale.saleDate).toLocaleDateString([], { dateStyle: 'medium' })} · {sale.items.length} items</Text>
                </View>
                <Text style={styles.historyAmount}>{formatMoney(Number(sale.total))}</Text>
              </View>
            )) : purchases.map((purchase) => (
              <View key={purchase.id} style={styles.historyCard}>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle}>{purchase.invoiceNumber || `Purchase ${purchase.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={styles.historyMeta}>{new Date(purchase.purchaseDate).toLocaleDateString([], { dateStyle: 'medium' })} · {purchase.items.length} items</Text>
                </View>
                <Text style={styles.purchaseAmount}>{purchase.total == null ? 'Restricted' : formatMoney(Number(purchase.total))}</Text>
              </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  back: { alignSelf: 'stretch', marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 17, marginBottom: 12, backgroundColor: '#FFFFFF' },
  backText: { color: '#24332A', fontSize: 27, fontWeight: '500' },
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
