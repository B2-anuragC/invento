import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen } from '@/components/invento-ui';
import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { appSession, guestShopSummary, loginWithEmail, moveGuestShopToAccount, registerWithEmail, type AppSession } from '@/services/api';
import { registerError, signInError } from '@/services/auth-validation';
import { summaryText, type UploadSummary } from '@/services/guest-upload';

type Summary = UploadSummary & { name: string };

type Stage = 'account' | 'confirm' | 'uploading' | 'done';

/**
 * Moves a guest shop to an account: the guest creates an account or signs in,
 * confirms, and the shop is uploaded as a new shop on that account.
 */
export default function GuestAccountScreen() {
  const router = useRouter();
  const guest = useRef<AppSession | null>(appSession.current?.mode === 'guest' ? appSession.current : null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [name, setName] = useState(() => (guest.current?.user.name && guest.current.user.name !== 'Owner' ? guest.current.user.name : ''));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState<AppSession | null>(null);
  const [stage, setStage] = useState<Stage>('account');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [differences, setDifferences] = useState<string[]>([]);

  useEffect(() => {
    if (!guest.current) return;
    guestShopSummary(guest.current).then(setSummary).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not read the guest shop.'));
  }, []);

  if (!guest.current && stage !== 'done') {
    return <AppScreen><ScrollView contentContainerStyle={[styles.content, screenStyles.content]}>
      <ScreenHeading title="Move to an account" subtitle="Only a guest shop can be moved" />
      <Text style={styles.copy}>You are already signed in to an account.</Text>
    </ScrollView></AppScreen>;
  }

  const authenticate = async () => {
    if (busy) return;
    const missing = mode === 'create' ? registerError({ name, email, password }) : signInError({ email, password });
    if (missing) { setError(missing); return; }
    setBusy(true);
    setError('');
    try {
      const response = mode === 'create'
        ? await registerWithEmail({ name: name.trim(), email: email.trim(), password, ...(guest.current?.user.phone ? { phone: guest.current.user.phone } : {}) })
        : await loginWithEmail(email.trim(), password);
      setAccount({ ...response, businessId: '' });
      setPassword('');
      setStage('confirm');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : mode === 'create' ? 'Unable to create your account.' : 'Unable to sign in right now.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!guest.current || !account || busy) return;
    setBusy(true);
    setError('');
    setStage('uploading');
    try {
      const result = await moveGuestShopToAccount(guest.current, account, (done, total, label) => setProgress({ done, total, label }));
      setDifferences(result.differences);
      guest.current = null;
      setStage('done');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload stopped.');
      setStage('confirm');
    } finally {
      setBusy(false);
    }
  };

  return <AppScreen><ScrollView contentContainerStyle={[styles.content, screenStyles.content]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <ScreenHeading title="Move to an account" subtitle={summary?.name ?? 'Your guest shop'} onBack={stage === 'uploading' ? () => undefined : undefined} />

    {stage !== 'done' ? <View style={styles.card}>
      <Text style={styles.cardTitle}>What moves</Text>
      <Text style={styles.copy}>{summary ? summaryText(summary) : 'Reading the shop on this phone…'}</Text>
      <Text style={styles.meta}>Everything is uploaded as a new shop on your account, with the same bill and note numbers, and its stock and payment history. It is never merged into a shop the account already has. Once it is uploaded, you can add staff and use the shop on other devices.</Text>
    </View> : null}

    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

    {stage === 'account' ? <View style={styles.card}>
      <View accessibilityRole="tablist" style={styles.segment}>
        {(['create', 'signin'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => { setMode(value); setError(''); }} style={[styles.segmentItem, mode === value && styles.segmentSelected]}>
          <Text style={[styles.segmentText, mode === value && styles.segmentSelectedText]}>{value === 'create' ? 'Create account' : 'Sign in'}</Text>
        </Pressable>)}
      </View>
      {mode === 'create' ? <>
        <Text style={styles.label}>Your name</Text>
        <TextInput accessibilityLabel="Your name" value={name} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Name" placeholderTextColor="#9CA3AF" autoCapitalize="words" autoComplete="name" textContentType="name" maxLength={100} style={styles.input} />
      </> : null}
      <Text style={styles.label}>Email address</Text>
      <TextInput accessibilityLabel="Email address" value={email} onChangeText={(value) => { setEmail(value); setError(''); }} placeholder="name@example.com" placeholderTextColor="#9CA3AF" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" style={styles.input} />
      <Text style={styles.label}>Password</Text>
      <TextInput accessibilityLabel="Password" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder={mode === 'create' ? 'Create a strong password' : 'Enter your password'} placeholderTextColor="#9CA3AF" secureTextEntry autoComplete={mode === 'create' ? 'new-password' : 'current-password'} textContentType={mode === 'create' ? 'newPassword' : 'password'} onSubmitEditing={() => void authenticate()} style={styles.input} />
      {mode === 'create' ? <Text style={styles.meta}>At least 8 characters, with uppercase and lowercase letters, a number, and a symbol.</Text> : null}
      <ActionButton fullWidth title={busy ? (mode === 'create' ? 'Creating account…' : 'Signing in…') : mode === 'create' ? 'Create account' : 'Sign in'} onPress={() => void authenticate()} disabled={busy || !summary} />
    </View> : null}

    {stage === 'confirm' && account ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Upload {summary?.name ?? 'this shop'}?</Text>
      <Text style={styles.copy}>It becomes a new shop on {account.user.email}. When it has uploaded, the app opens it there and removes the guest copy from this phone.</Text>
      <ActionButton fullWidth title={error ? 'Retry upload' : 'Upload shop'} onPress={() => void upload()} disabled={busy} />
      <ActionButton fullWidth variant="secondary" title="Not now" onPress={() => router.back()} disabled={busy} />
    </View> : null}

    {stage === 'uploading' ? <View accessibilityLiveRegion="polite" style={styles.card}>
      <ActivityIndicator color="#176B50" />
      <Text style={styles.cardTitle}>Uploading · {progress.label || 'Starting'}</Text>
      <Text style={styles.copy}>{progress.total ? `Step ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : 'Getting ready…'}</Text>
      <Text style={styles.meta}>Keep the app open. If the connection drops, retry and it continues where it stopped.</Text>
    </View> : null}

    {stage === 'done' ? <View style={styles.card}>
      <Text style={styles.cardTitle}>{differences.length ? 'Uploaded, with differences' : 'Your shop is on your account'}</Text>
      {differences.length ? <>
        <Text style={styles.copy}>These bills differ between the phone and the account. The guest copy stays on this phone so you can compare them.</Text>
        {differences.map((line) => <Text key={line} style={styles.difference}>• {line}</Text>)}
      </> : <Text style={styles.copy}>Every bill, note and stock figure matches the phone. The guest copy has been removed from this phone.</Text>}
      <ActionButton fullWidth title="Open shop" onPress={() => router.replace('/(tabs)')} />
    </View> : null}
  </ScrollView></AppScreen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E0E6E2', padding: 16, gap: 10 },
  cardTitle: { color: '#24332A', fontSize: 16, fontWeight: '700' },
  copy: { color: '#43554B', fontSize: 14, lineHeight: 20 },
  meta: { color: '#737B77', fontSize: 12, lineHeight: 18 },
  label: { color: '#43554B', fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#24332A', fontSize: 15 },
  error: { backgroundColor: '#FBECEA', borderRadius: 10, padding: 12, color: '#A74737', fontSize: 13 },
  difference: { color: '#7A3A2F', fontSize: 13, lineHeight: 19 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#DFE5E1', borderRadius: 10, overflow: 'hidden' },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: '#176B50' },
  segmentText: { color: '#68746E', fontSize: 13, fontWeight: '600' },
  segmentSelectedText: { color: '#FFFFFF' },
});
