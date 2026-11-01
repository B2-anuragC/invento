import {
  STOCK_ADJUSTMENT_MODES,
  STOCK_ADJUSTMENT_NOTE_MAX,
  planStockAdjustment,
  reasonsForMode,
  stockAdjustmentModeLabels,
  stockAdjustmentReasonLabels,
  type StockAdjustmentMode,
  type StockAdjustmentReason,
} from '@invento/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FormError } from '@/components/form-error';
import { ActionButton, AppScreen, formatUnitLabel } from '@/components/invento-ui';
import { ScreenHeading, screenStyles } from '@/components/screen-heading';
import { adjustStock, appSession, fetchInventory, fetchProducts, type InventoryRecord, type ProductRecord } from '@/services/api';
import { formatQuantity } from '@/services/format';
import { getSyncStatus, subscribeSyncStatus } from '@/services/offline-catalog';
import { ADJUST_OFFLINE_MESSAGE, sendStockNotice, stockChangePreview, stockSavedNotice } from '@/services/stock-adjustment';

const quantityLabels: Record<StockAdjustmentMode, string> = { count: 'Counted quantity', add: 'Quantity to add', remove: 'Quantity to remove' };

/** Set the counted stock, or add or remove stock, with a reason. Needs a connection. */
export default function AdjustStockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const offline = Platform.OS !== 'web' && !sync.online;
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [stock, setStock] = useState<Record<string, InventoryRecord>>({});
  const [productId, setProductId] = useState(params.productId ?? '');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<StockAdjustmentMode>('count');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('COUNT_CORRECTION');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    const session = appSession.current;
    if (!session) return;
    let active = true;
    Promise.all([fetchProducts(session, { status: 'ACTIVE' }), fetchInventory(session)])
      .then(([productData, inventoryData]) => {
        if (!active) return;
        setProducts(productData);
        setStock(Object.fromEntries(inventoryData.map((record) => [record.productId, record])));
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load products.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  // Damage and expiry only remove stock, so adding offers the other reasons.
  useEffect(() => {
    if (!reasonsForMode(mode).includes(reason)) setReason('COUNT_CORRECTION');
  }, [mode, reason]);

  const product = products.find((record) => record.id === productId);
  const record = product ? stock[product.id] : undefined;
  const hasOpening = !!record;
  const unit = product?.unit ?? 'PIECE';
  const plan = product && hasOpening && quantity !== ''
    ? planStockAdjustment({ productId: product.id, mode, quantity, reason, note, currentStock: record.quantity, unit, piecesPerUnit: product.piecesPerUnit })
    : null;

  const save = async () => {
    const session = appSession.current;
    if (!session || !product || saving) return;
    if (offline) { setError(ADJUST_OFFLINE_MESSAGE); return; }
    if (!plan) { setError(`Enter the ${quantityLabels[mode].toLowerCase()}.`); return; }
    if (!plan.ok) { setError(plan.error); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await adjustStock(session, { productId: product.id, mode, quantity, reason, note, unit, piecesPerUnit: product.piecesPerUnit });
      sendStockNotice({ productId: product.id, text: stockSavedNotice(product.name, saved.plan, unit) });
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)/inventory');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the adjustment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const query = search.trim().toLowerCase();
  const choices = products.filter((item) => !query || [item.name, item.sku, item.barcode].some((field) => field?.toLowerCase().includes(query)));

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeading title="Adjust stock" subtitle={product ? `${product.name} · ${product.sku}` : 'Choose the product you counted or want to correct'} />
        {offline ? <Text accessibilityRole="alert" style={styles.offline}>{ADJUST_OFFLINE_MESSAGE}</Text> : null}
        {loading ? <ActivityIndicator color="#176B50" style={styles.loading} /> : null}

        {!loading && !product ? (
          <>
            <TextInput value={search} onChangeText={setSearch} style={screenStyles.search} accessibilityLabel="Search products" placeholder="Search product, SKU or barcode" placeholderTextColor="#9CA3AF" autoCapitalize="none" />
            <View style={styles.card}>
              {choices.length === 0 ? <Text style={styles.muted}>{search ? 'No products match.' : 'No active products yet.'}</Text> : null}
              {choices.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Adjust ${item.name}`} onPress={() => { setProductId(item.id); setError(''); }} style={styles.choice}>
                  <Text style={styles.choiceName}>{item.name}</Text>
                  <Text style={styles.muted}>{stock[item.id] ? `${formatQuantity(Number(stock[item.id].quantity), item.unit)} in stock` : 'No opening stock yet'}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {product ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Current stock</Text>
              <Text style={styles.stock}>{hasOpening ? formatQuantity(Number(record.quantity), unit) : 'Not recorded'}</Text>
              {!params.productId ? (
                <Pressable accessibilityRole="button" onPress={() => { setProductId(''); setQuantity(''); setError(''); }} style={styles.change}>
                  <Text style={styles.changeText}>Choose another product</Text>
                </Pressable>
              ) : null}
            </View>

            {!hasOpening ? (
              <View style={styles.card}>
                <Text style={styles.muted}>This product has no opening stock yet. Record it on the product page first.</Text>
                <ActionButton title="Open product" variant="secondary" onPress={() => router.replace(`/product/${product.id}`)} />
              </View>
            ) : (
              <>
                <Text style={styles.section}>What do you want to do?</Text>
                <View style={screenStyles.chips}>
                  {STOCK_ADJUSTMENT_MODES.map((value) => (
                    <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => { setMode(value); setError(''); }} style={[screenStyles.chip, mode === value && screenStyles.chipActive]}>
                      <Text style={[screenStyles.chipText, mode === value && screenStyles.chipTextActive]}>{stockAdjustmentModeLabels[value]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.section}>{quantityLabels[mode]} ({formatUnitLabel(unit)})</Text>
                <TextInput
                  value={quantity}
                  onChangeText={(value) => { if (/^\d{0,9}(?:\.\d{0,3})?$/.test(value)) setQuantity(value); setError(''); }}
                  accessibilityLabel={quantityLabels[mode]}
                  placeholder={mode === 'count' ? 'How many are on the shelf' : '0'}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                {mode === 'count' ? <Text style={styles.help}>The difference from the current stock is recorded.</Text> : null}

                <Text style={styles.section}>Reason</Text>
                <View style={screenStyles.chips}>
                  {reasonsForMode(mode).map((value) => (
                    <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: reason === value }} onPress={() => { setReason(value); setError(''); }} style={[screenStyles.chip, reason === value && screenStyles.chipActive]}>
                      <Text style={[screenStyles.chipText, reason === value && screenStyles.chipTextActive]}>{stockAdjustmentReasonLabels[value]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.section}>Note{reason === 'OTHER' ? '' : ' (optional)'}</Text>
                <TextInput
                  value={note}
                  onChangeText={(value) => { setNote(value); setError(''); }}
                  accessibilityLabel="Note"
                  placeholder={reason === 'OTHER' ? 'Say why the stock changed' : 'e.g. Cracked in the rack'}
                  placeholderTextColor="#9CA3AF"
                  maxLength={STOCK_ADJUSTMENT_NOTE_MAX}
                  multiline
                  style={[styles.input, styles.note]}
                />

                {plan?.ok ? <Text style={styles.preview}>{stockChangePreview(plan, unit)}</Text> : null}
                <FormError message={error} />
                <ActionButton title={saving ? 'Saving…' : 'Save adjustment'} fullWidth disabled={saving || offline} onPress={() => void save()} />
              </>
            )}
          </>
        ) : null}
        {!product && error ? <FormError message={error} /> : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 20 },
  offline: { color: '#8A5A00', backgroundColor: '#FFF4D7', borderRadius: 11, padding: 12, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E2E2', padding: 16, marginBottom: 18, gap: 8 },
  label: { color: '#737B77', fontSize: 12, fontWeight: '700' },
  stock: { color: '#1D2B25', fontSize: 26, fontWeight: '800' },
  change: { alignSelf: 'flex-start', paddingVertical: 6 },
  changeText: { color: '#176B50', fontSize: 13, fontWeight: '700' },
  choice: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  choiceName: { color: '#24332A', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  muted: { color: '#737B77', fontSize: 13, lineHeight: 19 },
  section: { color: '#24332A', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  input: { minHeight: 48, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 14, paddingHorizontal: 14, color: '#24332A', fontSize: 15, marginBottom: 8 },
  note: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top', marginBottom: 16 },
  help: { color: '#737B77', fontSize: 12, marginBottom: 16 },
  preview: { color: '#104D3A', backgroundColor: '#E9F9F1', borderRadius: 11, padding: 12, fontSize: 14, fontWeight: '700', marginBottom: 12 },
});
