import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from './back-button';

export function ScreenHeading({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  return (
    <View style={styles.heading}>
      <BackButton onPress={onBack} />
      <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    </View>
  );
}

export const screenStyles = StyleSheet.create({
  content: { padding: 20, paddingTop: 16, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center' },
  search: { minHeight: 48, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 14, paddingHorizontal: 14, color: '#24332A', fontSize: 14, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  chipActive: { backgroundColor: '#176B50', borderColor: '#176B50' },
  chipText: { color: '#68746E', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#1D2B25', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 12, lineHeight: 18, marginTop: 4 },
});
