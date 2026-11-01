import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';
import type { Permission } from '@invento/shared';

import { BackButton } from './back-button';
import { Ionicons } from './ui/icon';
import { usePermissions } from '@/services/permissions';
import { clearChipLabel, statStripLabel, type FilterChip } from '@/services/list-header';

export function ScreenHeading({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  return (
    <View style={styles.heading}>
      <BackButton onPress={onBack} />
      <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    </View>
  );
}

/**
 * The compact header of a phone list screen (F8): one row with the back button
 * (only on screens outside the tab bar), the title, and the main actions as
 * labelled icon buttons on the right.
 */
export function ListHeader({ title, back = false, backFallback, actions, titleLines = 1 }: { title: string; back?: boolean; backFallback?: Href; actions?: ReactNode; titleLines?: 1 | 2 }) {
  return (
    <View style={styles.listHeader}>
      {back ? <BackButton fallback={backFallback} /> : null}
      <Text accessibilityRole="header" numberOfLines={titleLines} style={[styles.listTitle, titleLines > 1 && styles.listTitleWrap]}>{title}</Text>
      {actions ? <View style={styles.listActions}>{actions}</View> : null}
    </View>
  );
}

/** A 44 dp header action: an icon, with short visible text when there is room, and always a screen-reader name. */
export function HeaderIconButton({ icon, label, text, onPress, variant = 'plain', selected, permission, disabled }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; text?: string; onPress?: () => void; variant?: 'plain' | 'primary'; selected?: boolean; permission?: Permission; disabled?: boolean }) {
  const { can } = usePermissions();
  if (permission && !can(permission)) return null;
  const primary = variant === 'primary';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} hitSlop={2} style={({ pressed }) => [styles.iconButton, text ? styles.iconButtonWide : null, primary ? styles.iconPrimary : selected ? styles.iconSelected : styles.iconPlain, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={21} color={primary ? '#FFFFFF' : '#176B50'} />
      {text ? <Text numberOfLines={1} style={[styles.iconText, primary && styles.iconTextPrimary]}>{text}</Text> : null}
    </Pressable>
  );
}

/** Search field with an icon and a clear button; `trailing` (usually the Filters button) sits beside it. */
export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, trailing }: { value: string; onChangeText: (value: string) => void; placeholder: string; accessibilityLabel: string; trailing?: ReactNode }) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={19} color="#68766E" />
        <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#89918C" autoCapitalize="none" style={styles.searchInput} />
        {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} style={styles.clearButton}><Ionicons name="close" size={18} color="#738078" /></Pressable> : null}
      </View>
      {trailing}
    </View>
  );
}

/** The Filters button beside the search field; the count of filters that are on is part of its text. */
export function FilterButton({ text, accessibilityLabel, active, onPress }: { text: string; accessibilityLabel: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.filterButton, active && styles.filterButtonActive]}>
      <Ionicons name="options-outline" size={19} color="#176B50" />
      <Text style={styles.filterText}>{text}</Text>
    </Pressable>
  );
}

/**
 * The part of a list screen that stays pinned while the list scrolls: search
 * and filters. Pass its position among the ScrollView's children as
 * `stickyHeaderIndices`; it carries the screen background so rows pass under it.
 */
export function StickyBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.sticky, style]}>{children}</View>;
}

export type ChipOption = { key: string; label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string };

/** One horizontal row of filter chips (scrolls sideways when it does not fit). */
export function ChipRow({ options, clearable = [], onClear, label }: { options: ChipOption[]; clearable?: FilterChip[]; onClear?: (key: string) => void; label?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityLabel={label} contentContainerStyle={styles.chipRow}>
      {options.map((option) => (
        <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.accessibilityLabel ?? option.label} accessibilityState={{ selected: !!option.selected }} hitSlop={{ top: 4, bottom: 4 }} onPress={option.onPress} style={[styles.chip, option.selected && styles.chipActive]}>
          <Text style={[styles.chipText, option.selected && styles.chipTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
      {clearable.map((chip) => (
        <Pressable key={`clear-${chip.key}`} accessibilityRole="button" accessibilityLabel={clearChipLabel(chip)} hitSlop={{ top: 4, bottom: 4 }} onPress={() => onClear?.(chip.key)} style={[styles.chip, styles.chipClearable]}>
          <Text style={styles.chipClearText}>{chip.label}</Text>
          <Ionicons name="close" size={14} color="#176B50" />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export type StatStripItem = { label: string; value: string; tone?: 'green' | 'amber' | 'blue' | 'red'; onPress?: () => void; accessibilityLabel?: string };
const tones = { green: '#176B50', amber: '#96621B', blue: '#345B60', red: '#A74737' };

/**
 * Summary figures as one slim strip instead of a block of cards. Read as one
 * sentence by screen readers, unless its parts are buttons.
 */
export function StatStrip({ items, note }: { items: StatStripItem[]; note?: string | null }) {
  const interactive = items.some((item) => item.onPress);
  return (
    <View style={styles.stripWrap}>
      <View accessible={!interactive} accessibilityLabel={interactive ? undefined : statStripLabel(items)} style={styles.strip}>
        {items.map((item, index) => {
          const body = <>
            <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={[styles.stripValue, { color: tones[item.tone ?? 'green'] }]}>{item.value}</Text>
            <Text numberOfLines={1} style={styles.stripLabel}>{item.label}</Text>
          </>;
          const cellStyle = [styles.stripCell, index > 0 && styles.stripDivider];
          return item.onPress
            ? <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel ?? `${item.label} ${item.value}`} onPress={item.onPress} style={cellStyle}>{body}</Pressable>
            : <View key={item.label} style={cellStyle}>{body}</View>;
        })}
      </View>
      {note ? <Text style={styles.stripNote}>{note}</Text> : null}
    </View>
  );
}

/** Filters that do not fit in the chip row open in this bottom sheet. */
export function FilterSheet({ visible, title = 'Filters', onClose, onReset, children }: { visible: boolean; title?: string; onClose: () => void; onReset?: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheetBackdrop, { paddingTop: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close filters" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color="#24332A" /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>{children}</ScrollView>
          <View style={styles.sheetActions}>
            {onReset ? <Pressable accessibilityRole="button" onPress={onReset} style={[styles.sheetButton, styles.sheetSecondary]}><Text style={styles.sheetSecondaryText}>Clear filters</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={onClose} style={[styles.sheetButton, styles.sheetPrimary]}><Text style={styles.sheetPrimaryText}>Show results</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** A labelled group of choices inside a FilterSheet. */
export function SheetChoices({ title, options }: { title: string; options: ChipOption[] }) {
  return (
    <View style={styles.sheetGroup}>
      <Text style={styles.sheetGroupTitle}>{title}</Text>
      <View style={styles.sheetChoices}>
        {options.map((option) => (
          <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.accessibilityLabel ?? option.label} accessibilityState={{ selected: !!option.selected }} onPress={option.onPress} style={[styles.chip, styles.sheetChip, option.selected && styles.chipActive]}>
            <Text style={[styles.chipText, option.selected && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const screenStyles = StyleSheet.create({
  content: { padding: 20, paddingTop: 16, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center' },
  /** List screens with a compact header start closer to the top. */
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36, width: '100%', maxWidth: 680, alignSelf: 'center' },
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
  listHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  listTitle: { flex: 1, minWidth: 0, color: '#1D2B25', fontSize: 22, fontWeight: '800' },
  listTitleWrap: { fontSize: 19, lineHeight: 23 },
  listActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { minWidth: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  iconButtonWide: { paddingHorizontal: 12 },
  iconPlain: { borderWidth: 1, borderColor: '#E2E2E2', backgroundColor: '#FFFFFF' },
  iconSelected: { borderWidth: 1, borderColor: '#176B50', backgroundColor: '#E7F2ED' },
  iconPrimary: { backgroundColor: '#176B50' },
  iconText: { color: '#176B50', fontSize: 13, fontWeight: '800' },
  iconTextPrimary: { color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchWrap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 13, paddingLeft: 12 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 42, color: '#24332A', fontSize: 14, paddingVertical: 0 },
  clearButton: { width: 44, height: 42, alignItems: 'center', justifyContent: 'center' },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E2E2E2', backgroundColor: '#FFFFFF' },
  filterButtonActive: { borderColor: '#176B50', backgroundColor: '#E7F2ED' },
  filterText: { color: '#176B50', fontSize: 13, fontWeight: '800' },
  sticky: { backgroundColor: '#F5F5F5', paddingTop: 4, paddingBottom: 8, gap: 8, zIndex: 2 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 18, paddingHorizontal: 14, backgroundColor: '#FFFFFF' },
  chipActive: { backgroundColor: '#176B50', borderColor: '#176B50' },
  chipText: { color: '#5F6B65', fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  chipClearable: { borderColor: '#176B50', backgroundColor: '#E7F2ED', paddingRight: 10 },
  chipClearText: { color: '#176B50', fontSize: 13, fontWeight: '700' },
  stripWrap: { marginBottom: 6 },
  strip: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 13, paddingVertical: 8 },
  stripCell: { flex: 1, minWidth: 0, paddingHorizontal: 10, justifyContent: 'center', minHeight: 40 },
  stripDivider: { borderLeftWidth: 1, borderLeftColor: '#EBEEEC' },
  stripValue: { fontSize: 16, fontWeight: '800' },
  stripLabel: { color: '#737B77', fontSize: 11, fontWeight: '600', marginTop: 1 },
  stripNote: { color: '#737B77', fontSize: 11, lineHeight: 16, marginTop: 4, paddingHorizontal: 2 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 24, 39, 0.4)' },
  sheet: { maxHeight: '85%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  sheetTitle: { color: '#1D2B25', fontSize: 18, fontWeight: '800' },
  sheetScroll: { flexGrow: 0 },
  sheetGroup: { marginBottom: 16 },
  sheetGroupTitle: { color: '#43554B', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  sheetChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { minHeight: 44 },
  sheetActions: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  sheetButton: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetPrimary: { backgroundColor: '#176B50' },
  sheetSecondary: { backgroundColor: '#EEF1EF' },
  sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  sheetSecondaryText: { color: '#24332A', fontSize: 14, fontWeight: '800' },
});
