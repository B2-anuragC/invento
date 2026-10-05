import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, appColors } from '@/components/invento-ui';
import {
  appSession,
  createCustomer,
  createSupplier,
  fetchCustomers,
  fetchSuppliers,
  type CustomerRecord,
  type SupplierRecord,
} from '@/services/api';

type PersonFilter = 'All' | 'Customers' | 'Suppliers';
type ContactKind = 'customer' | 'supplier';
type ContactFields = { name: string; contactName: string; phone: string; email: string; address: string };
type PersonItem = { id: string; name: string; phone?: string | null; contactName?: string | null; kind: ContactKind };
const emptyContact: ContactFields = { name: '', contactName: '', phone: '', email: '', address: '' };

export default function PeopleDirectoryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<PersonFilter>('All');
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [contactKind, setContactKind] = useState<ContactKind>('customer');
  const [contact, setContact] = useState<ContactFields>(emptyContact);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadDirectory = useCallback(() => {
    const session = appSession.current;
    if (!session) {
      setError('Sign in to view business contacts.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchCustomers(session), fetchSuppliers(session)])
      .then(([customerData, supplierData]) => {
        setCustomers(customerData);
        setSuppliers(supplierData);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load people.'))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { loadDirectory(); }, [loadDirectory]));

  const people: PersonItem[] = [
    ...(filter !== 'Suppliers' ? customers.map((item) => ({ ...item, kind: 'customer' as const })) : []),
    ...(filter !== 'Customers' ? suppliers.map((item) => ({ ...item, kind: 'supplier' as const })) : []),
  ].filter((item) => `${item.name} ${item.contactName ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name));

  const saveContact = async () => {
    const session = appSession.current;
    if (!session || !contact.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const input = {
        name: contact.name.trim(),
        contactName: contact.contactName.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        address: contact.address.trim(),
      };
      if (contactKind === 'customer') await createCustomer(session, input);
      else await createSupplier(session, input);
      setContact(emptyContact);
      setModalVisible(false);
      loadDirectory();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : `Could not save ${contactKind}.`);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setContact(emptyContact);
    setError('');
    setContactKind(filter === 'Suppliers' ? 'supplier' : 'customer');
    setModalVisible(true);
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>People</Text>
            <Text style={styles.subtitle}>CUSTOMERS & SUPPLIERS</Text>
          </View>
          <Pressable accessibilityLabel="Add person" onPress={openCreate} style={styles.addButton}>
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search by name or phone" placeholderTextColor="#7A817E" style={styles.search} />
        </View>
        <View style={styles.filters}>
          {(['All', 'Customers', 'Suppliers'] as PersonFilter[]).map((value) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{value}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.balanceNote}>Your business contacts · Tap a person to view history</Text>
        {filter !== 'Suppliers' ? (
          <View style={styles.group}>
            <View style={styles.groupHeading}>
              <Text style={styles.groupTitle}>Customers</Text>
              <Pressable onPress={() => { setFilter('Customers'); openCreate(); }}><Text style={styles.addLink}>+ Add customer</Text></Pressable>
            </View>
            {!loading && filter === 'Customers' && people.filter((item) => item.kind === 'customer').length === 0 ? (
              <Text style={styles.emptyGroup}>No customers match your search.</Text>
            ) : null}
            {people.filter((item) => item.kind === 'customer').map((item) => (
              <Pressable key={`customer-${item.id}`} onPress={() => router.push(`/people/customers/${item.id}`)} style={styles.personCard}>
                <View style={styles.avatar}><Text style={styles.avatarText}>♙</Text></View>
                <View style={styles.personCopy}>
                  <Text numberOfLines={1} style={styles.personName}>{item.name}</Text>
                  <Text numberOfLines={1} style={styles.personMeta}>{item.phone || item.contactName || 'Customer contact'}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {filter !== 'Customers' ? (
          <View style={styles.group}>
            <View style={styles.groupHeading}>
              <Text style={styles.groupTitle}>Suppliers</Text>
              <Pressable onPress={() => { setFilter('Suppliers'); openCreate(); }}><Text style={styles.addLink}>+ Add supplier</Text></Pressable>
            </View>
            {!loading && filter === 'Suppliers' && people.filter((item) => item.kind === 'supplier').length === 0 ? (
              <Text style={styles.emptyGroup}>No suppliers match your search.</Text>
            ) : null}
            {people.filter((item) => item.kind === 'supplier').map((item) => (
              <Pressable key={`supplier-${item.id}`} onPress={() => router.push(`/people/suppliers/${item.id}`)} style={styles.personCard}>
                <View style={[styles.avatar, styles.supplierAvatar]}><Text style={[styles.avatarText, styles.supplierAvatarText]}>▰</Text></View>
                <View style={styles.personCopy}>
                  <Text numberOfLines={1} style={styles.personName}>{item.name}</Text>
                  <Text numberOfLines={1} style={styles.personMeta}>{item.phone || item.contactName || 'Supplier contact'}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {loading ? <ActivityIndicator color={appColors.primary} style={styles.loading} /> : null}
        {error && !modalVisible ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && people.length === 0 ? (
          <Text style={styles.empty}>{search ? 'No people match your search.' : 'Add a customer or supplier to get started.'}</Text>
        ) : null}
      </ScrollView>
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle}>Add {contactKind}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setModalVisible(false)}><Text style={styles.close}>×</Text></Pressable>
            </View>
            <View style={styles.kindChoices}>
              {(['customer', 'supplier'] as ContactKind[]).map((value) => (
                <Pressable key={value} onPress={() => setContactKind(value)} style={[styles.kindChoice, contactKind === value && styles.kindChoiceSelected]}>
                  <Text style={[styles.kindChoiceText, contactKind === value && styles.kindChoiceTextSelected]}>{value === 'customer' ? 'Customer' : 'Supplier'}</Text>
                </Pressable>
              ))}
            </View>
            {([
              ['name', 'Business name *'],
              ['contactName', 'Contact person'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['address', 'Address'],
            ] as const).map(([key, label]) => (
              <TextInput
                key={key}
                value={contact[key]}
                onChangeText={(value) => setContact((current) => ({ ...current, [key]: value }))}
                placeholder={label}
                placeholderTextColor="#7A817E"
                autoCapitalize={key === 'email' ? 'none' : 'words'}
                keyboardType={key === 'phone' ? 'phone-pad' : key === 'email' ? 'email-address' : 'default'}
                style={styles.modalInput}
              />
            ))}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable disabled={!contact.name.trim() || saving} onPress={() => void saveContact()} style={[styles.saveButton, (!contact.name.trim() || saving) && styles.disabled]}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : `Add ${contactKind}`}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 34, backgroundColor: '#F5F5F5' },
  header: { minHeight: 92, marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#1D2B25', fontSize: 29, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 12, marginTop: 4 },
  addButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#24332A', fontSize: 28, fontWeight: '400' },
  searchWrap: { minHeight: 52, marginTop: 16, borderRadius: 13, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  searchIcon: { color: '#747C78', fontSize: 24, marginRight: 9 },
  search: { flex: 1, color: '#24332A', fontSize: 14, paddingVertical: 12 },
  filters: { flexDirection: 'row', gap: 9, marginTop: 14 },
  filter: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 17, borderRadius: 12, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF' },
  filterSelected: { backgroundColor: '#176B50', borderColor: '#176B50' },
  filterText: { color: '#747C78', fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  balanceNote: { color: '#737B77', fontSize: 11, marginTop: 17, marginBottom: 2 },
  group: { marginTop: 12 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupTitle: { color: '#24332A', fontSize: 18, fontWeight: '800' },
  addLink: { color: '#176B50', fontSize: 12, fontWeight: '700' },
  personCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#176B50', fontSize: 21 },
  supplierAvatar: { backgroundColor: '#EDF2EF' },
  supplierAvatarText: { color: '#40584B' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: '#24332A', fontSize: 14, fontWeight: '800' },
  personMeta: { color: '#737B77', fontSize: 11, marginTop: 4 },
  chevron: { color: '#176B50', fontSize: 26 },
  loading: { marginVertical: 20 },
  emptyGroup: { color: '#737B77', fontSize: 12, padding: 15, backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 8 },
  empty: { color: '#737B77', textAlign: 'center', marginTop: 12, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 12, fontSize: 12 },
  error: { color: '#A74737', backgroundColor: '#FBECEA', padding: 12, borderRadius: 11, fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 31, 25, 0.38)' },
  modalCard: { backgroundColor: '#F5F5F5', padding: 20, paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#24332A', fontSize: 20, fontWeight: '800', textTransform: 'capitalize' },
  close: { color: '#66716B', fontSize: 28, lineHeight: 30 },
  kindChoices: { flexDirection: 'row', gap: 8, marginBottom: 3 },
  kindChoice: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF' },
  kindChoiceSelected: { backgroundColor: '#176B50', borderColor: '#176B50' },
  kindChoiceText: { color: '#737B77', fontSize: 12, fontWeight: '600' },
  kindChoiceTextSelected: { color: '#FFFFFF' },
  modalInput: { minHeight: 47, borderRadius: 11, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: '#24332A', fontSize: 13 },
  saveButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#176B50', alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
