import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/invento-ui';
import { appSession, fetchBusinesses, loginWithEmail, persistSession, restoreSession, type AppSession } from '@/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const session = await restoreSession();
      if (!session) {
        appSession.current = null;
        if (active) setCheckingSession(false);
        return;
      }

      appSession.current = session;
      try {
        const memberships = await fetchBusinesses(session);
        if (!active) return;
        const selected = memberships.find((membership) => membership.business.id === session.businessId);
        if (selected) {
          const restored = { ...(appSession.current ?? session), businessName: selected.business.name };
          appSession.current = restored;
          await persistSession(restored);
          router.replace('/(tabs)');
        } else {
          router.replace('/business/setup');
        }
      } catch (restoreError) {
        if (active) {
          setError(restoreError instanceof Error ? restoreError.message : 'Could not restore your session.');
          setCheckingSession(false);
        }
      }
    };

    void restore();
    return () => { active = false; };
  }, [router]);

  const handleSignIn = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError('');
      const response = await loginWithEmail(email, password);
      const session: AppSession = { ...response, businessId: '' };
      appSession.current = session;
      await persistSession(session);
      router.replace('/business/setup');
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in right now.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.loading]}>
        <ActivityIndicator size="large" color="#1F9D68" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.badge}>Invento</Text>
          <Text style={styles.title}>Your retail ops, in one place.</Text>
          <Text style={styles.subtitle}>
            Track stock, purchases, sales, and daily performance without slowing down your shop.
          </Text>
        </View>

        <View style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="name@business.com"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          <ActionButton title={loading ? 'Signing in...' : 'Sign in'} onPress={handleSignIn} />

          <View style={styles.secondaryRow}>
            <ActionButton title="Create account" variant="secondary" onPress={() => router.push('/auth/register')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    marginBottom: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E9F9F1',
    color: '#0F766E',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  title: {
    marginTop: 16,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  error: {
    backgroundColor: '#FEECEC',
    borderRadius: 10,
    padding: 12,
    color: '#B91C1C',
    fontSize: 13,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    color: '#111827',
    fontSize: 15,
  },
  secondaryRow: {
    marginTop: 12,
  },
});
