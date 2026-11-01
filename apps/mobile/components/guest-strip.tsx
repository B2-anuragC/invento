import { StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@/components/ui/icon';
import { appSession } from '@/services/api';

/** Tells a guest that their shop is saved only on this phone. Shows nothing for an account. */
export function GuestStrip() {
  if (appSession.current?.mode !== 'guest') return null;
  return <View accessibilityRole="summary" style={styles.strip}>
    <Ionicons name="phone-portrait-outline" size={16} color="#8A5A12" />
    <Text style={styles.text}>Guest · saved on this phone only</Text>
  </View>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#F1DDB4' },
  text: { flex: 1, color: '#6B4A12', fontSize: 13, fontWeight: '600' },
});
