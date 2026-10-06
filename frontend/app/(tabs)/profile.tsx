import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, ListCard } from '@/components/invento-ui';
import { appSession, logoutSession, persistSession, updateProfile } from '@/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [profile, setProfile] = useState(() => appSession.current?.user ?? null);
  const [name, setName] = useState(() => appSession.current?.user.name ?? '');
  const [phone, setPhone] = useState(() => appSession.current?.user.phone ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const beginEditing = () => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
    setNameError('');
    setPhoneError('');
    setSubmitError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
    setNameError('');
    setPhoneError('');
    setSubmitError('');
    setEditing(false);
  };

  const clearFieldErrorsOnEdit = (field: 'name' | 'phone' | 'submit') => {
    if (field === 'name') setNameError('');
    if (field === 'phone') setPhoneError('');
    if (field === 'submit') setSubmitError('');
  };

  const handleSaveProfile = async () => {
    if (saving) return;
    const session = appSession.current;
    const cleanName = name.trim();
    if (!session) {
      setSubmitError('Sign in again to edit your profile.');
      return;
    }
    if (cleanName.length < 2) {
      setNameError('Name must contain at least 2 characters.');
      setSubmitError('');
      return;
    }

    setSaving(true);
    setNameError('');
    setPhoneError('');
    setSubmitError('');
    try {
      const updatedUser = await updateProfile(session, { name: cleanName, phone: phone.trim() });
      const updatedSession = { ...session, user: updatedUser };
      appSession.current = updatedSession;
      setProfile(updatedUser);
      setName(updatedUser.name);
      setPhone(updatedUser.phone ?? '');
      setEditing(false);
      try {
        await persistSession(updatedSession);
      } catch {
        setSubmitError('Profile updated, but could not save the session on this device.');
      }
    } catch (saveError: unknown) {
      setSubmitError(saveError instanceof Error ? saveError.message : 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const session = appSession.current;
    if (session) {
      try {
        await logoutSession(session);
      } catch {
        appSession.current = null;
      }
    }
    router.replace('/auth/login');
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={[styles.content, screenStyles.content]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeading title="Your account" subtitle="Profile, business and preferences" />

        <View style={styles.card}>
          <Text style={styles.avatar}>{profile?.name?.slice(0, 1).toUpperCase() ?? 'I'}</Text>
          {editing ? (
            <View style={styles.editFields}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  clearFieldErrorsOnEdit('name');
                  clearFieldErrorsOnEdit('submit');
                }}
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                maxLength={100}
              />
              {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                value={phone}
                onChangeText={(value) => {
                  setPhone(value);
                  clearFieldErrorsOnEdit('phone');
                  clearFieldErrorsOnEdit('submit');
                }}
                style={styles.input}
                placeholder="Add a phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={30}
              />
              {phoneError ? <Text style={styles.error}>{phoneError}</Text> : null}
            </View>
          ) : (
            <>
              <Text style={styles.name}>{profile?.name ?? 'Account'}</Text>
              <Text style={styles.role}>{profile?.email ?? ''}</Text>
              <Text style={styles.role}>{profile?.phone || 'Phone not added'}</Text>
            </>
          )}
          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
        </View>

        <ListCard title="Business info">
          <View style={styles.row}>
            <Text style={styles.label}>Business</Text>
            <Text style={styles.value}>{appSession.current?.businessName ?? 'Selected shop'}</Text>
          </View>
        </ListCard>

        <View style={styles.actions}>
          <ListCard title="Your workspace">
            {[
              { title: 'Inventory', detail: 'Stock health and availability', route: '/(tabs)/inventory' },
              { title: 'Sales history', detail: 'Invoices and repeat sales', route: '/(tabs)/sales' },
              { title: 'Purchase history', detail: 'Supplier invoices and replenishment', route: '/(tabs)/purchases' },
              { title: 'People & contacts', detail: 'Customers and suppliers', route: '/people' },
              { title: 'Pricing access', detail: 'Control price visibility', route: '/settings/pricing' },
            ].map((item) => (
              <Pressable key={item.route} accessibilityRole="button" onPress={() => router.push(item.route as Parameters<typeof router.push>[0])} style={styles.row}>
                <View style={{ flex: 1 }}><Text style={styles.value}>{item.title}</Text><Text style={styles.role}>{item.detail}</Text></View>
                <Text style={{ color: '#737B77', fontSize: 24 }}>›</Text>
              </Pressable>
            ))}
          </ListCard>
          {editing ? (
            <>
              <ActionButton title={saving ? 'Saving…' : 'Save changes'} onPress={() => void handleSaveProfile()} disabled={saving} />
              <ActionButton title="Cancel" variant="secondary" onPress={cancelEditing} disabled={saving} />
            </>
          ) : (
            <ActionButton title="Edit profile" variant="secondary" onPress={beginEditing} />
          )}
          <ActionButton title={loggingOut ? 'Signing out…' : 'Log out'} onPress={() => void handleLogout()} disabled={loggingOut || saving} />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#24332A',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E2E2',
    marginBottom: 18,
  },
  avatar: {
    width: 70,
    height: 70,
    lineHeight: 70,
    borderRadius: 35,
    backgroundColor: '#E7F2ED',
    color: '#176B50',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#24332A',
  },
  role: {
    marginTop: 6,
    color: '#737B77',
    fontSize: 13,
  },
  editFields: {
    width: '100%',
    marginTop: 8,
  },
  fieldLabel: {
    color: '#43554B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'left',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 14,
    color: '#24332A',
    fontSize: 14,
    width: '100%',
  },
  error: {
    marginTop: 12,
    color: '#A74737',
    fontSize: 13,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  label: {
    color: '#737B77',
    fontSize: 13,
  },
  value: {
    color: '#24332A',
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    marginTop: 18,
    gap: 12,
  },
});
