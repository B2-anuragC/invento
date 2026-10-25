import { Children, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ListingView = 'list' | 'grid';

export function ListingViewToggle({ value, onChange }: { value: ListingView; onChange: (value: ListingView) => void }) {
  return <View style={styles.toggle}>
    {(['list', 'grid'] as const).map((mode) => <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`Show ${mode} view`} accessibilityState={{ selected: value === mode }} onPress={() => onChange(mode)} style={[styles.option, value === mode && styles.selected]}>
      <Ionicons name={mode === 'grid' ? 'grid-outline' : 'list-outline'} size={17} color={value === mode ? '#FFFFFF' : '#737B77'} />
      <Text style={[styles.label, value === mode && styles.selectedLabel]}>{mode === 'grid' ? 'Grid' : 'List'}</Text>
    </Pressable>)}
  </View>;
}

export function ListingLayout({ view, children }: { view: ListingView; children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const columns = view === 'list' || width < 300 ? 1 : width >= 580 ? 3 : 2;
  const cardWidth = width ? (width - (columns - 1) * 12) / columns : undefined;
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.items}>
    {Children.toArray(children).map((child, index) => <View key={typeof child === 'object' && 'key' in child ? child.key : index} style={{ width: cardWidth ?? '100%' }}>{child}</View>)}
  </View>;
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', padding: 3, borderRadius: 12 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 9 },
  selected: { backgroundColor: '#176B50' },
  label: { color: '#737B77', fontSize: 12, fontWeight: '700' },
  selectedLabel: { color: '#FFFFFF' },
  items: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, alignItems: 'stretch' },
});
