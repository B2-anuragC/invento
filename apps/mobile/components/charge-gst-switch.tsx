import { StyleSheet, Switch, Text, View } from 'react-native';

import { chargeGstSwitch } from '@/services/gst';

/** "Charge GST" on a new sale, "Supplier charged GST" on a purchase; off by default. */
export function ChargeGstSwitch({ kind, value, onChange, shop, disabled = false }: { kind: 'sale' | 'purchase'; value: boolean; onChange: (value: boolean) => void; shop: { gstin?: string | null } | null | undefined; disabled?: boolean }) {
  const state = chargeGstSwitch(kind, value, shop);
  const label = kind === 'sale' ? 'Charge GST' : 'Supplier charged GST';
  const off = disabled || state.disabled;
  return <View style={styles.row}>
    <View style={styles.text}>
      <Text style={[styles.label, state.disabled && styles.muted]}>{label}</Text>
      <Text style={styles.note}>{state.note}</Text>
    </View>
    <Switch accessibilityLabel={label} accessibilityHint={state.note} value={value && !state.disabled} disabled={off} onValueChange={onChange} trackColor={{ false: '#D5DDD8', true: '#80AB94' }} thumbColor={value && !state.disabled ? '#176B50' : '#F4F6F5'} />
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  text: { flex: 1, gap: 2 },
  label: { color: '#24332A', fontSize: 14, fontWeight: '700' },
  muted: { color: '#737B77' },
  note: { color: '#737B77', fontSize: 12, lineHeight: 18 },
});
