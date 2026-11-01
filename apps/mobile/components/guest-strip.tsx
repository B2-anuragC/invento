import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@/components/ui/icon';
import { appSession } from '@/services/api';

/** Tells a guest that their shop is saved only on this phone, with a way to move it to an account. Shows nothing for an account. */
export function GuestStrip() {
  const router = useRouter();
  if (appSession.current?.mode !== 'guest') return null;
  return <View accessibilityRole="summary" style={styles.strip}>
    <Ionicons name="phone-portrait-outline" size={16} color="#8A5A12" />
    <Text style={styles.text}>Guest · saved on this phone only</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Create an account and move this shop to it" onPress={() => router.push('/guest/account')} style={styles.action}>
      <Text style={styles.actionText}>Create account</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 8, paddingVertical: 0, borderRadius: 10, backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#F1DDB4' },
  text: { flex: 1, color: '#6B4A12', fontSize: 13, fontWeight: '600' },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actionText: { color: '#176B50', fontSize: 13, fontWeight: '700' },
});
