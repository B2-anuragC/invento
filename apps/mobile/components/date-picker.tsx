import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { canShowPreviousMonth, dateKey, isSelectableDay } from '@/services/date-limits';
import { formatDate } from '@/services/format';

const parseDate = (value: string) => { const date = new Date(`${value}T12:00:00`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) ? date : new Date(); };

/** `minimumDate` / `maximumDate` (YYYY-MM-DD) disable earlier / later days, e.g. a due date before the bill's own date. */
export function DatePicker({ value, onChange, title = 'Select date', placeholder = 'Select date', clearLabel = 'Clear date', style, minimumDate, maximumDate }: { value: string; onChange: (value: string) => void; title?: string; placeholder?: string; clearLabel?: string; style?: StyleProp<ViewStyle>; minimumDate?: string; maximumDate?: string }) {
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(new Date());
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((start.getDay() + days) / 7) * 7 }, (_, index) => {
    const number = index - start.getDay() + 1;
    return number > 0 && number <= days ? new Date(month.getFullYear(), month.getMonth(), number, 12) : null;
  });
  const select = (date: string) => { onChange(date); setVisible(false); };
  const previousAllowed = canShowPreviousMonth(month, minimumDate);
  const todayAllowed = isSelectableDay(dateKey(new Date()), minimumDate, maximumDate);
  const fieldName = title.replace(/^Select /, '');
  const fieldLabel = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${fieldLabel}: ${formatDate(value)}` : title} onPress={() => { setMonth(parseDate(value)); setVisible(true); }} style={[styles.trigger, style]}>
      <Ionicons name="calendar-outline" size={20} color="#176B50" />
      <Text style={styles.label}>{value ? formatDate(value) : placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color="#176B50" />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.row}><Text style={styles.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={() => setVisible(false)} style={styles.button}><Ionicons name="close" size={22} color="#176B50" /></Pressable></View>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !previousAllowed }} disabled={!previousAllowed} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.button}><Ionicons name="chevron-back" size={22} color={previousAllowed ? '#176B50' : '#C5CDC8'} /></Pressable>
            <Text style={styles.title}>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.button}><Ionicons name="chevron-forward" size={22} color="#176B50" /></Pressable>
          </View>
          <View style={styles.grid}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
            {cells.map((date, index) => { if (!date) return <View key={index} style={styles.cell} />; const key = dateKey(date); const allowed = isSelectableDay(key, minimumDate, maximumDate); return <Pressable key={index} accessibilityRole="button" accessibilityLabel={date.toLocaleDateString('en-IN', { dateStyle: 'full' })} accessibilityState={{ selected: key === value, disabled: !allowed }} disabled={!allowed} onPress={() => select(key)} style={[styles.cell, key === value && styles.selected]}><Text style={[styles.day, !allowed && styles.unavailable, key === value && styles.selectedText]}>{date.getDate()}</Text></Pressable>; })}
          </View>
          <View style={styles.row}><Pressable accessibilityRole="button" onPress={() => select('')} style={styles.button}><Text style={styles.action}>{clearLabel}</Text></Pressable>{todayAllowed ? <Pressable accessibilityRole="button" onPress={() => select(dateKey(new Date()))} style={styles.button}><Text style={styles.action}>Today</Text></Pressable> : null}</View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#DCE5DF', backgroundColor: '#FFFFFF' },
  label: { flex: 1, color: '#243A30', fontSize: 15 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 16 },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: '#243A30' },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 12 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: '#64756B', fontSize: 12, paddingVertical: 8 },
  cell: { width: `${100 / 7}%`, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  selected: { backgroundColor: '#176B50' }, day: { color: '#243A30', fontSize: 15 }, selectedText: { color: '#FFFFFF', fontWeight: '700' }, unavailable: { color: '#C5CDC8' }, action: { color: '#176B50', fontWeight: '700' },
});
