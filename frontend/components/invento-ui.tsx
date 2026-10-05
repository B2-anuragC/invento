import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

const unitLabels: Record<string, string> = {
  PIECE: 'piece',
  KG: 'kg',
  GRAM: 'g',
  LITRE: 'litre',
  MILLILITRE: 'ml',
  METRE: 'm',
  SQUARE_FOOT: 'sq ft',
  FOOT: 'feet',
  PACK: 'pack',
  BOX: 'box',
  DOZEN: 'dozen',
};

export function formatUnitLabel(unit: string) {
  return unitLabels[unit] ?? unit.replaceAll('_', ' ').toLowerCase();
}

export function AppScreen({ children, style }: { children: ReactNode; style?: any }) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={[styles.screen, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function SummaryCard({
  label,
  value,
  delta,
  accent = 'green',
}: {
  label: string;
  value: string;
  delta?: string;
  accent?: 'green' | 'amber' | 'blue' | 'red';
}) {
  const tones = {
    green: { background: '#E7F2ED', text: '#176B50' },
    amber: { background: '#FFF5D8', text: '#96621B' },
    blue: { background: '#EDF2EF', text: '#345B60' },
    red: { background: '#FBECEA', text: '#A74737' },
  };

  const tone = tones[accent];

  return (
    <View style={[styles.summaryCard, { backgroundColor: tone.background }]}>
      <Text style={[styles.summaryLabel, { color: tone.text }]}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={[styles.summaryValue, { color: tone.text }]}>
        {value}
      </Text>
      {delta ? <Text style={[styles.summaryDelta, { color: tone.text }]}>{delta}</Text> : null}
    </View>
  );
}

export function ActionButton({
  title,
  onPress,
  variant = 'primary',
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'primary' ? styles.primaryAction : styles.secondaryAction,
        pressed && { opacity: 0.9 },
      ]}>
      <Text style={[styles.actionText, variant === 'primary' ? styles.primaryText : styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel ?? onConfirm}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <View style={styles.dialogActions}>
            {cancelLabel ? (
              <ActionButton title={cancelLabel} variant="secondary" onPress={onCancel} />
            ) : null}
            <ActionButton title={confirmLabel} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ProductRow({
  name,
  sku,
  stock,
  unit = 'units',
  price,
  lowStock,
  onPress,
}: {
  name: string;
  sku: string;
  stock: number;
  unit?: string;
  price: string;
  lowStock?: boolean;
  onPress?: () => void;
}) {
  const stockLabel = stock <= 0 ? 'Out of stock' : lowStock ? 'Low stock' : 'In stock';

  return (
    <Pressable onPress={onPress} style={styles.productRow}>
      <View style={[styles.productBadge, stock <= 0 ? styles.badgeEmpty : lowStock ? styles.badgeWarning : styles.badgeSuccess]}>
        <Text style={styles.badgeText}>{stockLabel}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{name}</Text>
        <Text style={styles.metaText}>{sku}</Text>
      </View>
      <View style={styles.productMeta}>
        <Text style={styles.metaValue}>{stock} {formatUnitLabel(unit)}</Text>
        <Text style={styles.metaText}>{price}</Text>
      </View>
    </Pressable>
  );
}

export function ListCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.listCard}>
      <Text style={styles.listTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ScrollSection({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dialogTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  dialogMessage: {
    marginTop: 8,
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  summaryCard: {
    width: '48%',
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 18,
    padding: 16,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 12,
  },
  summaryDelta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  actionButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  primaryAction: {
    backgroundColor: '#0C7253',
  },
  secondaryAction: {
    backgroundColor: '#E5E7EB',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#111827',
  },
  productRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  productMeta: {
    alignItems: 'flex-end',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  productBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeWarning: {
    backgroundColor: '#FFF4D7',
  },
  badgeEmpty: {
    backgroundColor: '#FEECEC',
  },
  badgeSuccess: {
    backgroundColor: '#E9F9F1',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#111827',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
});

export const appColors = {
  primary: '#176B50',
  primaryDeep: '#104D3A',
  background: '#F5F5F5',
  input: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E2E2E2',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  white: '#FFFFFF',
  dark: '#0F172A',
};

export const cardShadow = {
  shadowColor: Colors.light.text,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 3,
};
