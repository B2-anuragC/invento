import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ScreenHeading({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    </View>
  );
}

export const screenStyles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center' },
  search: { minHeight: 48, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 14, paddingHorizontal: 14, color: '#24332A', fontSize: 14, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  chipActive: { backgroundColor: '#176B50', borderColor: '#176B50' },
  chipText: { color: '#68746E', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  back: { width: 42, height: 42, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#24332A', fontSize: 29, lineHeight: 32 },
  copy: { flex: 1 },
  title: { color: '#1D2B25', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 12, lineHeight: 18, marginTop: 4 },
});
