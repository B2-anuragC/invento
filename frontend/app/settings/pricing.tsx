import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, ConfirmationDialog, appColors } from '@/components/invento-ui';
import {
  addBusinessUser,
  appSession,
  fetchBusinessUsers,
  fetchPricingAccess,
  removeBusinessUser,
  updateBusinessUser,
  updatePricingAccess,
  type BusinessUserRecord,
  type PricingAccess,
} from '@/services/api';

export default function PricingAccessScreen() {
  const router = useRouter();
  const [access, setAccess] = useState<PricingAccess | null>(null);
  const [users, setUsers] = useState<BusinessUserRecord[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [removeTarget, setRemoveTarget] = useState<BusinessUserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = useCallback(() => {
    const session = appSession.current;
    if (!session) {
      setError('Sign in to manage business access.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchPricingAccess(session), fetchBusinessUsers(session)])
      .then(([pricing, members]) => {
        setAccess(pricing);
        setUsers(members);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load access settings.'))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { loadSettings(); }, [loadSettings]));

  const updateVisibility = async (enabled: boolean) => {
    const session = appSession.current;
    if (!session || saving || !access) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updatePricingAccess(session, enabled);
      setAccess({ ...access, ...updated });
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update pricing access.');
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async () => {
    const session = appSession.current;
    if (!session || !email.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await addBusinessUser(session, { email: email.trim(), role });
      setEmail('');
      loadSettings();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not add member.');
    } finally {
      setSaving(false);
    }
  };

  const changeMemberRole = async (member: BusinessUserRecord, nextRole: 'ADMIN' | 'MEMBER') => {
    const session = appSession.current;
    if (!session || saving || member.role === 'OWNER' || member.role === nextRole) return;
    setSaving(true);
    setError('');
    try {
      await updateBusinessUser(session, member.user.id, nextRole);
      setUsers((current) => current.map((item) => item.user.id === member.user.id ? { ...item, role: nextRole } : item));
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update team role.');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    const session = appSession.current;
    const target = removeTarget;
    if (!session || !target || saving) return;
    setSaving(true);
    setError('');
    try {
      await removeBusinessUser(session, target.user.id);
      setUsers((current) => current.filter((item) => item.user.id !== target.user.id));
      setRemoveTarget(null);
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove team member.');
    } finally {
      setSaving(false);
    }
  };

  const isManager = access?.role === 'OWNER' || access?.role === 'ADMIN';

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <View>
            <Text style={styles.title}>Pricing & access</Text>
            <Text style={styles.headerSubtitle}>Invento · {(access?.role ?? 'BUSINESS').toUpperCase()} SETTINGS</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Choose what your team can see and manage who can access this business.</Text>

        {loading ? <ActivityIndicator color={appColors.primary} style={styles.state} /> : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <ActionButton title="Retry" variant="secondary" onPress={loadSettings} />
          </View>
        ) : null}
        {access ? (
          <>
            <View style={styles.settingCard}>
              <View style={styles.settingIcon}><Text style={styles.iconText}>₹</Text></View>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Show purchase prices to members</Text>
                <Text style={styles.settingDescription}>
                  {access.membersCanViewPurchasePrice
                    ? 'Members can see buy rates and purchase totals.'
                    : 'Buy rates and purchase totals are hidden from members.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: access.membersCanViewPurchasePrice, disabled: !isManager || saving }}
                disabled={!isManager || saving}
                onPress={() => void updateVisibility(!access.membersCanViewPurchasePrice)}
                style={[styles.switch, access.membersCanViewPurchasePrice && styles.switchOn, (!isManager || saving) && styles.disabled]}>
                <View style={[styles.switchThumb, access.membersCanViewPurchasePrice && styles.switchThumbOn]} />
              </Pressable>
            </View>
            {!isManager ? <Text style={styles.readOnly}>Only business owners and admins can change this setting.</Text> : null}
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Protected on the server</Text>
              <Text style={styles.noticeCopy}>When hidden, purchase cost fields are removed from member API responses—not just covered in the app.</Text>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Team access</Text>
              <Text style={styles.count}>{users.length} people</Text>
            </View>
            {users.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{member.user.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.memberDetails}>
                  <Text style={styles.memberName}>{member.user.name}</Text>
                  <Text style={styles.memberEmail}>{member.user.email}</Text>
                </View>
                {member.role === 'OWNER' ? (
                  <Text style={styles.ownerBadge}>OWNER</Text>
                ) : isManager ? (
                  <View style={styles.roleChoices}>
                    {(['MEMBER', 'ADMIN'] as const).map((value) => (
                      <Pressable
                        key={value}
                        disabled={saving}
                        onPress={() => void changeMemberRole(member, value)}
                        style={[styles.roleOption, member.role === value && styles.roleOptionSelected]}>
                        <Text style={[styles.roleText, member.role === value && styles.roleTextSelected]}>{value === 'MEMBER' ? 'Staff' : 'Admin'}</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => setRemoveTarget(member)} accessibilityLabel={`Remove ${member.user.name}`} style={styles.removeButton}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ) : <Text style={styles.ownerBadge}>{member.role}</Text>}
              </View>
            ))}

            {isManager ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteTitle}>Add team member</Text>
                <Text style={styles.inviteDescription}>They need an existing Invento account to join.</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Account email"
                  placeholderTextColor="#89918C"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
                <View style={styles.inviteBottom}>
                  <View style={styles.roleChoices}>
                    {(['MEMBER', 'ADMIN'] as const).map((value) => (
                      <Pressable key={value} onPress={() => setRole(value)} style={[styles.roleOption, role === value && styles.roleOptionSelected]}>
                        <Text style={[styles.roleText, role === value && styles.roleTextSelected]}>{value === 'MEMBER' ? 'Staff' : 'Admin'}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable disabled={!email.trim() || saving} onPress={() => void saveMember()} style={[styles.inviteButton, (!email.trim() || saving) && styles.disabled]}>
                    <Text style={styles.inviteButtonText}>{saving ? 'Adding…' : 'Add member'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ConfirmationDialog
        visible={Boolean(removeTarget)}
        title="Remove team member?"
        message={`Remove ${removeTarget?.user.name ?? 'this person'} from this business? Their historical activity will remain.`}
        confirmLabel={saving ? 'Removing…' : 'Remove'}
        cancelLabel="Cancel"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  header: { minHeight: 90, marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  back: { alignSelf: 'center', paddingVertical: 8, paddingRight: 13 },
  backText: { color: '#24332A', fontSize: 29, fontWeight: '500' },
  eyebrow: { color: '#557267', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#1D2B25', fontSize: 26, fontWeight: '800' },
  headerSubtitle: { color: '#737B77', fontSize: 11, marginTop: 4 },
  subtitle: { color: '#68746E', fontSize: 13, lineHeight: 19, marginTop: 3, marginBottom: 18 },
  state: { marginVertical: 22 },
  errorBox: { backgroundColor: '#F6E9E6', borderRadius: 14, padding: 13, gap: 11 },
  error: { color: '#A74737', fontSize: 12 },
  settingCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 17, padding: 14 },
  settingIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#E8F2EC', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#176B50', fontSize: 20, fontWeight: '800' },
  settingCopy: { flex: 1 },
  settingTitle: { color: '#24332A', fontSize: 13, fontWeight: '800' },
  settingDescription: { color: '#78837C', fontSize: 10, lineHeight: 15, marginTop: 4 },
  switch: { width: 43, height: 26, borderRadius: 99, padding: 3, backgroundColor: '#D7DED8', justifyContent: 'center' },
  switchOn: { backgroundColor: '#0C7253' },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  switchThumbOn: { alignSelf: 'flex-end' },
  disabled: { opacity: 0.55 },
  readOnly: { color: '#78837C', fontSize: 10, marginTop: 8, marginLeft: 3 },
  notice: { backgroundColor: '#E8F2EC', borderRadius: 14, padding: 13, marginTop: 12 },
  noticeTitle: { color: '#176B50', fontSize: 11, fontWeight: '800' },
  noticeCopy: { color: '#65766B', fontSize: 10, lineHeight: 15, marginTop: 4 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 25, marginBottom: 10 },
  sectionTitle: { color: '#1B2921', fontSize: 18, fontWeight: '800' },
  count: { color: '#849088', fontSize: 11 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9E4', borderRadius: 14, padding: 11, marginBottom: 8 },
  avatar: { width: 37, height: 37, borderRadius: 13, backgroundColor: '#E9EFF0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#345B60', fontSize: 14, fontWeight: '800' },
  memberDetails: { flex: 1, minWidth: 0 },
  memberName: { color: '#26362E', fontSize: 12, fontWeight: '800' },
  memberEmail: { color: '#78837C', fontSize: 9, marginTop: 4 },
  ownerBadge: { color: '#176B50', backgroundColor: '#E8F2EC', fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  roleChoices: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleOption: { paddingVertical: 6, paddingHorizontal: 7, borderRadius: 8, backgroundColor: '#F3F5F3' },
  roleOptionSelected: { backgroundColor: '#E8F2EC' },
  roleText: { color: '#77827B', fontSize: 9, fontWeight: '700' },
  roleTextSelected: { color: '#176B50' },
  removeButton: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#A74737', fontSize: 18 },
  inviteCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E9E4', borderRadius: 16, padding: 14, marginTop: 9 },
  inviteTitle: { color: '#24332A', fontSize: 13, fontWeight: '800' },
  inviteDescription: { color: '#78837C', fontSize: 10, marginTop: 4, marginBottom: 11 },
  input: { backgroundColor: '#F7F9F7', borderWidth: 1, borderColor: '#E0E7E1', borderRadius: 11, minHeight: 43, paddingHorizontal: 11, color: '#17241E', fontSize: 12 },
  inviteBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  inviteButton: { backgroundColor: '#0C7253', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  inviteButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
