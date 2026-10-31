import { financialYearOf, formatDocumentNumber, GST_STATES } from '@invento/shared';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FormError } from '@/components/form-error';
import { ActionButton, AppScreen, appColors } from '@/components/invento-ui';
import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { appSession, fetchBusinessDetails, updateBusinessDetails, type BusinessDetails } from '@/services/api';
import { shopDetailsErrors, shopDetailsInput, stateFromGstin, type ShopDetailsErrors, type ShopDetailsForm } from '@/services/shop-details';

const STATES = Object.entries(GST_STATES).sort(([, a], [, b]) => a.localeCompare(b));

const toForm = (business: BusinessDetails): ShopDetailsForm => ({
  name: business.name,
  phone: business.phone ?? '',
  email: business.email ?? '',
  address: business.address ?? '',
  gstin: business.gstin ?? '',
  stateCode: business.stateCode ?? '',
  invoicePrefix: business.invoicePrefix ?? 'INV',
  purchasePrefix: business.purchasePrefix ?? 'PUR',
});

/** Shop details printed on receipts and invoices. Saved online; owners and admins only. */
export default function ShopDetailsScreen() {
  const [form, setForm] = useState<ShopDetailsForm | null>(null);
  const [errors, setErrors] = useState<ShopDetailsErrors>({});
  const [stateOpen, setStateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useFocusEffect(useCallback(() => {
    const session = appSession.current;
    if (!session) return;
    let active = true;
    setLoading(true);
    fetchBusinessDetails(session)
      .then((business) => { if (active) setForm(toForm(business)); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load shop details.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const change = (key: keyof ShopDetailsForm, value: string) => {
    // A valid GSTIN sets the state it was registered in.
    const registered = key === 'gstin' ? stateFromGstin(value) : '';
    setForm((current) => (current ? { ...current, [key]: value, ...(registered ? { stateCode: registered } : {}) } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setNotice('');
  };

  const save = async () => {
    const session = appSession.current;
    if (!session || !form || saving) return;
    const found = shopDetailsErrors(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setError('Check the highlighted details.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await updateBusinessDetails(session, shopDetailsInput(form));
      setForm(toForm(saved));
      setNotice('Shop details saved. New receipts and invoices use them.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save shop details. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const registeredState = form ? stateFromGstin(form.gstin) : '';
  const stateCode = registeredState || form?.stateCode || '';
  const field = (key: keyof ShopDetailsForm, label: string, options: Partial<React.ComponentProps<typeof TextInput>> = {}, hint?: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={form?.[key] ?? ''}
        onChangeText={(value) => change(key, value)}
        editable={!saving}
        placeholderTextColor="#9CA3AF"
        style={[styles.input, errors[key] && styles.inputError]}
        {...options}
      />
      {errors[key] ? <Text style={styles.fieldError}>{errors[key]}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeading title="Shop details" subtitle="Printed on receipts and GST invoices" />
        {loading && !form ? <ActivityIndicator color={appColors.primary} /> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        {form ? (
          <>
            <View style={styles.card}>
              <Text style={styles.section}>Shop</Text>
              {field('name', 'Shop name', { placeholder: 'e.g. Shree Glass & Hardware', autoCapitalize: 'words' })}
              {field('address', 'Address', { placeholder: 'Shop number, street, city, PIN', multiline: true })}
              {field('phone', 'Phone', { placeholder: '+91 98765 43210', keyboardType: 'phone-pad' })}
              {field('email', 'Email', { placeholder: 'name@business.com', keyboardType: 'email-address', autoCapitalize: 'none' })}
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>GST</Text>
              {field('gstin', 'GSTIN (optional)', { placeholder: '27AAPFU0939F1ZV', autoCapitalize: 'characters', autoCorrect: false, maxLength: 20 }, 'Leave blank if the shop is not registered for GST; receipts then print as a bill of supply.')}
              <View style={styles.field}>
                <Text style={styles.label}>State</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`State: ${stateCode ? GST_STATES[stateCode] : 'not set'}`}
                  accessibilityState={{ expanded: stateOpen, disabled: !!registeredState }}
                  disabled={!!registeredState || saving}
                  onPress={() => setStateOpen((open) => !open)}
                  style={[styles.input, styles.select, errors.stateCode && styles.inputError, registeredState && styles.locked]}
                >
                  <Text style={{ color: stateCode ? '#24332A' : '#9CA3AF', flex: 1 }}>{stateCode ? `${GST_STATES[stateCode]} (${stateCode})` : 'Choose the state'}</Text>
                  {!registeredState ? <Text style={styles.hint}>{stateOpen ? '▴' : '▾'}</Text> : null}
                </Pressable>
                {errors.stateCode ? <Text style={styles.fieldError}>{errors.stateCode}</Text> : <Text style={styles.hint}>{registeredState ? 'Set from the GSTIN.' : 'Used as the place of supply for counter sales.'}</Text>}
                {stateOpen && !registeredState ? (
                  <ScrollView style={styles.dropdown} nestedScrollEnabled>
                    {STATES.map(([code, name]) => (
                      <Pressable key={code} accessibilityRole="button" accessibilityState={{ selected: form.stateCode === code }} onPress={() => { change('stateCode', code); setStateOpen(false); }} style={[styles.option, form.stateCode === code && styles.optionSelected]}>
                        <Text style={form.stateCode === code ? styles.optionTextSelected : styles.optionText}>{name}</Text>
                        <Text style={styles.hint}>{code}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>Invoice numbers</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>{field('invoicePrefix', 'Sales prefix', { autoCapitalize: 'characters', maxLength: 3 })}</View>
                <View style={{ flex: 1 }}>{field('purchasePrefix', 'Purchase prefix', { autoCapitalize: 'characters', maxLength: 3 })}</View>
              </View>
              <Text style={styles.hint}>
                Numbers look like {formatDocumentNumber((form.invoicePrefix || 'INV').toUpperCase(), financialYearOf(new Date()), 1)}. Changing a prefix continues the same yearly count.
              </Text>
            </View>
          </>
        ) : null}
        <FormError message={error} />
        {form ? <ActionButton fullWidth title={saving ? 'Saving…' : 'Save shop details'} onPress={() => void save()} disabled={saving} /> : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E4E7E5', padding: 16, marginBottom: 14 },
  section: { color: '#1D2B25', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  field: { marginBottom: 12 },
  label: { color: '#43554B', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { minHeight: 48, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#24332A', fontSize: 15 },
  inputError: { borderColor: '#B54435' },
  select: { flexDirection: 'row', alignItems: 'center' },
  locked: { backgroundColor: '#EEF2F0' },
  dropdown: { maxHeight: 260, marginTop: 6, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 12, backgroundColor: '#FFFFFF' },
  option: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionSelected: { backgroundColor: '#E7F2ED' },
  optionText: { color: '#24332A', fontSize: 14 },
  optionTextSelected: { color: '#176B50', fontSize: 14, fontWeight: '700' },
  fieldError: { color: '#A74737', fontSize: 12, marginTop: 4 },
  hint: { color: '#737B77', fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  notice: { backgroundColor: '#E7F2ED', color: '#176B50', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13 },
});
