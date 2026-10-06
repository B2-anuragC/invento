import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/invento-ui';
import { appSession, persistSession, registerWithEmail } from '@/services/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearErrorOnEdit = () => {
    if (error) setError('');
  };

  const handleRegister = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await registerWithEmail({ name: name.trim(), email: email.trim(), password });
      const session = { ...result, businessId: '' };
      appSession.current = session;
      await persistSession(session);
      router.replace('/business/setup');
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={styles.brand}>Invento</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Set up your account first. You can add your shop next.</Text>

        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Your name</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              clearErrorOnEdit();
            }}
            placeholder="Name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            style={styles.input}
            maxLength={100}
          />
          <Text style={styles.label}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              clearErrorOnEdit();
            }}
            placeholder="name@example.com"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address" autoComplete="email"
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearErrorOnEdit();
            }}
            placeholder="Create a strong password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            style={styles.input}
          />
          <Text style={styles.passwordHint}>
            At least 8 characters, with uppercase and lowercase letters, a number, and a symbol.
          </Text>
          <ActionButton title={loading ? 'Creating account…' : 'Create account'} onPress={handleRegister} disabled={loading || name.trim().length < 2 || !email.trim() || !password} />
        </View>

        <Text style={styles.footer} onPress={() => router.replace('/auth/login')}>
          Already have an account? <Text style={styles.footerAction}>Sign in</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { color: '#176B50', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  title: { marginTop: 12, color: '#24332A', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 8, marginBottom: 22, color: '#737B77', fontSize: 14, lineHeight: 20 },
  form: { padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 18 },
  error: { color: '#A74737', backgroundColor: '#FBECEA', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 },
  label: { color: '#43554B', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 16, color: '#24332A', fontSize: 15 },
  passwordHint: { marginTop: -8, marginBottom: 16, color: '#737B77', fontSize: 12, lineHeight: 18 },
  footer: { marginTop: 20, textAlign: 'center', color: '#737B77', fontSize: 13 },
  footerAction: { color: '#176B50', fontWeight: '700' },
});
