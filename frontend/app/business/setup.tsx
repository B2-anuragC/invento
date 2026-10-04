import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { appSession, createBusiness, fetchBusinesses, persistSession, type BusinessMembership } from '@/services/api';

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export default function BusinessSetupScreen() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessMembership[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [businessesLoadFailed, setBusinessesLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const clearErrorOnEdit = () => {
    if (error) setError('');
  };

  useEffect(() => {
    let active = true;
    const session = appSession.current;
    if (!session) {
      router.replace('/auth/login');
      return () => { active = false; };
    }

    fetchBusinesses(session)
      .then(async (result) => {
        if (!active) return;
        setBusinesses(result);
        setBusinessesLoadFailed(false);
        const selected = result.find((membership) => membership.business.id === session.businessId)
          ?? (result.length === 1 ? result[0] : null);
        if (selected) {
          const updatedSession = {
            ...session,
            businessId: selected.business.id,
            businessName: selected.business.name,
          };
          await persistSession(updatedSession);
          if (!active) return;
          appSession.current = updatedSession;
          router.replace('/(tabs)');
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setBusinessesLoadFailed(true);
          setError(loadError instanceof Error ? loadError.message : 'Could not load your businesses.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [router]);

  const chooseBusiness = async (businessId: string, businessName?: string) => {
    const session = appSession.current;
    if (!session) {
      router.replace('/auth/login');
      return;
    }
    const selectedBusinessName = businessName ?? businesses.find(
      (membership) => membership.business.id === businessId,
    )?.business.name;
    const selected = {
      ...session,
      businessId,
      ...(selectedBusinessName ? { businessName: selectedBusinessName } : {}),
    };
    appSession.current = selected;
    try {
      await persistSession(selected);
      router.replace('/(tabs)');
    } catch (saveError) {
      appSession.current = session;
      setError(saveError instanceof Error ? saveError.message : 'Could not save the selected business.');
    }
  };

  const handleCreate = async () => {
    const session = appSession.current;
    const cleanName = name.trim();
    const cleanSlug = toSlug(slug);
    if (!session || cleanName.length < 2 || cleanSlug.length < 2 || saving) return;

    setSaving(true);
    setError('');
    try {
      const business = await createBusiness(session, { name: cleanName, slug: cleanSlug });
      await chooseBusiness(business.id, business.name);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create your business.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Invento</Text>
        <Text style={styles.title}>Choose your shop</Text>
        <Text style={styles.subtitle}>Business data stays separate for each shop you belong to.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your businesses</Text>
          {loading ? <ActivityIndicator size="small" color="#1F9D68" /> : null}
        </View>
        {businesses.map((membership) => (
          <Pressable
            key={membership.business.id}
            onPress={() => void chooseBusiness(membership.business.id, membership.business.name)}
            style={styles.businessRow}>
            <View style={styles.businessIcon}><Text style={styles.businessInitial}>{membership.business.name.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.businessText}>
              <Text style={styles.businessName}>{membership.business.name}</Text>
              <Text style={styles.businessMeta}>{membership.role.toLowerCase()} · {membership.business.slug}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        {!loading && !businessesLoadFailed && businesses.length === 0 ? <Text style={styles.empty}>No business is linked to this account yet.</Text> : null}

        {!loading && !businessesLoadFailed ? <View style={styles.createSection}>
          <Text style={styles.sectionTitle}>Create a business</Text>
          <Text style={styles.formHint}>Use your shop name. You can update the details later.</Text>
          <Text style={styles.label}>Business name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              clearErrorOnEdit();
              if (!slugEdited) setSlug(toSlug(value));
            }}
            placeholder="e.g. Mohan General Store"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            maxLength={120}
          />
          <Text style={styles.label}>Unique shop ID</Text>
          <TextInput
            value={slug}
            onChangeText={(value) => {
              setSlugEdited(true);
              setSlug(toSlug(value));
              clearErrorOnEdit();
            }}
            placeholder="mohan-general-store"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            style={styles.input}
            maxLength={80}
          />
          <Pressable
            accessibilityRole="button"
            disabled={saving || name.trim().length < 2 || slug.trim().length < 2}
            onPress={() => void handleCreate()}
            style={[styles.createButton, (saving || name.trim().length < 2 || slug.trim().length < 2) && styles.disabled]}>
            <Text style={styles.createButtonText}>{saving ? 'Creating…' : 'Create shop'}</Text>
          </Pressable>
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { flexGrow: 1, padding: 24, paddingBottom: 36 },
  brand: { color: '#0F766E', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  title: { marginTop: 12, color: '#111827', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 8, marginBottom: 24, color: '#6B7280', fontSize: 14, lineHeight: 20 },
  error: { color: '#B91C1C', backgroundColor: '#FEECEC', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#111827', fontSize: 17, fontWeight: '700' },
  businessRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 13, marginBottom: 9 },
  businessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E9F9F1', alignItems: 'center', justifyContent: 'center' },
  businessInitial: { color: '#0F766E', fontSize: 16, fontWeight: '800' },
  businessText: { flex: 1, minWidth: 0, marginLeft: 12 },
  businessName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  businessMeta: { marginTop: 4, color: '#6B7280', fontSize: 11 },
  chevron: { color: '#6B7280', fontSize: 24, paddingHorizontal: 6 },
  empty: { color: '#6B7280', fontSize: 13, marginBottom: 12 },
  createSection: { marginTop: 24, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16 },
  formHint: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 18 },
  label: { color: '#374151', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 15, color: '#111827', fontSize: 14 },
  createButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F9D68', borderRadius: 12, marginTop: 4 },
  createButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabled: { backgroundColor: '#9CA3AF' },
});
