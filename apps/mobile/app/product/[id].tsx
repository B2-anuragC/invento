import { usePermissions } from '@/services/permissions';
import { FormError } from '@/components/form-error';
import { formatDateTime, formatMoney, formatQuantity } from '@/services/format';
import { hsnCodeError } from '@/services/gst';
import { ProductPhoto, type ProductPhotoValue } from '@/components/product-photo';
import { inventoryMovementLabel, inventoryMovementNote, normalizeHsnCode, sellingUnitChoices, sellingUnitConversion } from '@invento/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { receiveStockNotice } from '@/services/stock-adjustment';
import { groupSizeLabel, sellingOptionRows, stockWarning, taxSummary } from '@/services/product-summary';
import { addedProductNotice, openingStockError, sendAddedProduct } from '@/services/new-product';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen, ConfirmationDialog, formatUnitLabel } from '@/components/invento-ui';
import { formSnapshot, hasUnsavedChanges } from '@/services/unsaved-changes';
import {
  appSession,
  createProduct,
  deactivateProduct,
  fetchProduct,
  fetchProductCategories,
  fetchProductStock,
  fetchProductTransactions,
  recordOpeningStock,
  updateProduct,
  type InventoryRecord,
  type InventoryTransactionRecord,
  type ProductInput,
  type SellingOption,
  type ProductRecord,
} from '@/services/api';

const productUnits = ['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'SQUARE_FOOT', 'FOOT', 'PACK', 'BOX', 'DOZEN', 'OTHER'];
const moneyPattern = /^\d{0,10}(?:\.\d{0,2})?$/;
const quantityPattern = /^\d{0,9}(?:\.\d{0,3})?$/;



function decimalValue(value: string, precision: number) {
  const [whole = '0', fraction = ''] = (value || '0').split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  return `${normalizedWhole}.${fraction.padEnd(precision, '0').slice(0, precision)}`;
}

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [inventory, setInventory] = useState<InventoryRecord | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransactionRecord[]>([]);
  const [photo, setPhoto] = useState<ProductPhotoValue>({ imageThumbnail: null, imageOriginal: null });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryLoadError, setCategoryLoadError] = useState(false);
  const [unit, setUnit] = useState('PIECE');
  const [piecesPerUnit, setPiecesPerUnit] = useState('');
  const [sellingOptions, setSellingOptions] = useState<SellingOption[]>([]);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('0');
  const [hsnCode, setHsnCode] = useState('');
  const [minimumStock, setMinimumStock] = useState('0');
  const [openingStock, setOpeningStock] = useState('');
  const [editing, setEditing] = useState(isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigation = useNavigation();
  const [leaveAction, setLeaveAction] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const leavingAfterSave = useRef(false);

  // Unsaved changes: compare the editable fields with the snapshot taken when editing began.
  const currentForm = formSnapshot({ photo, name, sku, barcode, category, unit, piecesPerUnit, sellingOptions, purchasePrice, sellingPrice, gstRate, hsnCode, minimumStock, openingStock });
  const baselineForm = useRef<string | undefined>(isNew ? currentForm : undefined);
  useEffect(() => {
    if (!editing) baselineForm.current = currentForm;
  }, [editing, currentForm]);
  const unsaved = editing && hasUnsavedChanges(baselineForm.current, currentForm);
  usePreventRemove(unsaved && !saving, ({ data }) => {
    // After a save the guard may not have caught up with the saving state yet; let that leave go ahead.
    if (leavingAfterSave.current) navigation.dispatch(data.action);
    else setLeaveAction(data.action);
  });

  const fillForm = (productData: ProductRecord) => {
    setPhoto({ images: productData.images, imageThumbnail: productData.imageThumbnail ?? null, imageOriginal: productData.imageOriginal ?? null });
    setName(productData.name);
    setSku(productData.sku);
    setBarcode(productData.barcode ?? '');
    setCategory(productData.category ?? '');
    setUnit(productData.unit);
    setSellingOptions(productData.sellingOptions ?? []);
    setPiecesPerUnit(productData.piecesPerUnit ? String(productData.piecesPerUnit) : '');
    setPurchasePrice(String(productData.purchasePrice));
    setSellingPrice(String(productData.sellingPrice));
    setGstRate(String(productData.gstRate ?? 0));
    setHsnCode(productData.hsnCode ?? '');
    setMinimumStock(String(productData.minimumStock));
  };
  const cancelEditing = () => {
    if (product) fillForm(product);
    setError('');
    setEditing(false);
  };

  const addSellingOption = () => {
    setSellingOptions((current) => current.length >= 20 ? current : [...current, {
      id: `option_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: '', unit, quantity: '', sellingPrice: '',
    }]);
    if (error) setError('');
  };

  const clearErrorOnEdit = () => {
    if (error) setError('');
  };

  useEffect(() => {
    let active = true;
    const session = appSession.current;
    if (!session) { setCategoryLoading(false); return; }
    fetchProductCategories(session).then((values) => {
      if (active) setCategories([...new Set(values)].sort((left, right) => left.localeCompare(right)));
    }).catch(() => { if (active) setCategoryLoadError(true); }).finally(() => { if (active) setCategoryLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    setLoading(true);
    setError('');
    const session = appSession.current;
    if (!session) {
      router.replace('/auth/login');
      return () => { active = false; };
    }

    Promise.all([
      fetchProduct(session, id),
      fetchProductStock(session, id),
      fetchProductTransactions(session, id),
    ])
      .then(([productData, stockData, transactionData]) => {
        if (!active) return;
        setProduct(productData);
        setInventory(stockData);
        setTransactions(transactionData);
        setEditing(false);
        setNotice('');
        fillForm(productData);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load product details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id, isNew, router]);

  // Back from adjusting this product's stock: reload the balance and history, and say what changed.
  useFocusEffect(useCallback(() => {
    if (isNew) return;
    const stockNotice = receiveStockNotice(id);
    const session = appSession.current;
    if (!stockNotice || !session) return;
    setNotice(stockNotice.text);
    let active = true;
    Promise.all([fetchProductStock(session, id), fetchProductTransactions(session, id)])
      .then(([stockData, transactionData]) => { if (active) { setInventory(stockData); setTransactions(transactionData); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not reload stock.'); });
    return () => { active = false; };
  }, [id, isNew]));

  const saveProduct = async () => {
    const session = appSession.current;
    if (!session || saving || photoBusy) return;
    const cleanName = name.trim();
    const cleanSku = sku.trim();
    if (cleanName.length < 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(cleanSku)) {
      setError('Enter a product name and a valid SKU (letters, numbers, dot, underscore, or hyphen).');
      return;
    }

    if (['BOX', 'PACK'].includes(unit) && piecesPerUnit && (!Number.isInteger(Number(piecesPerUnit)) || Number(piecesPerUnit) < 1 || Number(piecesPerUnit) > 100000)) {
      setError('Enter a whole number of pieces per group, from 1 to 100000.');
      return;
    }
    const groupSize = unit === 'DOZEN' ? 12 : Number(piecesPerUnit) || 0;
    for (const [index, option] of sellingOptions.entries()) {
      const prefix = `Option ${index + 1}: `;
      if (!option.name.trim()) { setError(prefix + 'enter a name.'); return; }
      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(option.quantity) || Number(option.quantity) <= 0) { setError(prefix + 'enter a quantity greater than zero.'); return; }
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(option.sellingPrice) || Number(option.sellingPrice) <= 0) { setError(prefix + 'enter a price greater than zero.'); return; }
      const conversion = sellingUnitConversion(unit, groupSize || null, option.unit, option.piecesPerUnit);
      if (!conversion) { setError(prefix + 'select a compatible unit and enter pieces per box or pack.'); return; }
      const movement = (conversion.perOption ? 1 : Number(option.quantity)) * conversion.numerator / conversion.denominator;
      const pieces = movement * (conversion.unit === 'PIECE' ? 1 : groupSize || 1);
      if ((groupSize || unit === 'PIECE') && Math.abs(pieces - Math.round(pieces)) > 1e-8) { setError(prefix + 'the quantity must contain whole pieces.'); return; }
      if (Math.abs(movement * 1000 - Math.round(movement * 1000)) > 1e-7) { setError(prefix + 'use a quantity that fits the stock unit’s three-decimal precision.'); return; }
    }
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(gstRate) || Number(gstRate) > 100) { setError('Enter a GST rate from 0 to 100%.'); return; }
    const hsnError = hsnCodeError(hsnCode);
    if (hsnError) { setError(hsnError); return; }
    const recordStock = isNew && openingStock !== '' && can('inventory.adjust');
    const openingError = recordStock ? openingStockError(openingStock, unit, ['BOX', 'PACK', 'DOZEN'].includes(unit) ? groupSize || null : null) : '';
    if (openingError) { setError(openingError); return; }
    const input: ProductInput = {
      ...photo,
      gstRate,
      hsnCode: normalizeHsnCode(hsnCode),
      name: cleanName,
      sku: cleanSku,
      barcode: barcode.trim(),
      category: category.trim(),
      unit,
      sellingOptions,
      ...(['BOX', 'PACK'].includes(unit) && piecesPerUnit ? { piecesPerUnit: Number(piecesPerUnit) } : {}),
      purchasePrice: decimalValue(purchasePrice, 2),
      sellingPrice: decimalValue(sellingPrice, 2),
      minimumStock: decimalValue(minimumStock, 3),
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (isNew) {
        const createdProduct = await createProduct(session, input);
        // Opening stock is a separate ledger entry; if it fails the product still exists and can get it later.
        let opening: { quantity: string; error?: string } | null = null;
        if (recordStock) {
          try {
            await recordOpeningStock(session, createdProduct.id, openingStock);
            opening = { quantity: openingStock };
          } catch (stockError) {
            opening = { quantity: openingStock, error: stockError instanceof Error ? stockError.message : 'Could not record opening stock.' };
          }
        }
        sendAddedProduct({ id: createdProduct.id, name: createdProduct.name, notice: addedProductNotice(createdProduct.name, createdProduct.unit, opening, can('inventory.adjust')) });
        leavingAfterSave.current = true;
        if (router.canGoBack()) router.back();
        else router.replace('/products');
      } else {
        const updated = await updateProduct(session, id, input);
        setProduct(updated);
        setEditing(false);
        setNotice('Product details saved.');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const saveOpeningStock = async () => {
    const session = appSession.current;
    if (!session || !product || !quantityPattern.test(openingStock) || openingStock === '') return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const stock = await recordOpeningStock(session, product.id, openingStock);
      const history = await fetchProductTransactions(session, product.id);
      setInventory(stock);
      setTransactions(history);
      setOpeningStock('');
      setNotice('Opening stock recorded. Inventory transactions will update this balance automatically.');
    } catch (stockError) {
      setError(stockError instanceof Error ? stockError.message : 'Could not record opening stock.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = () => {
    if (!product) return;
    const activate = product.status === 'INACTIVE';
    Alert.alert(
      activate ? 'Reactivate product?' : 'Deactivate product?',
      activate ? 'This product will be available for new transactions.' : 'This hides the product from new transactions while preserving its history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activate ? 'Reactivate' : 'Deactivate',
          onPress: () => {
            const session = appSession.current;
            if (!session) return;
            setSaving(true);
            const operation = activate
              ? updateProduct(session, product.id, { status: 'ACTIVE' })
              : deactivateProduct(session, product.id);
            void operation
              .then(setProduct)
              .catch((deactivateError: unknown) => setError(deactivateError instanceof Error ? deactivateError.message : 'Could not update product status.'))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color="#1F9D68" />
        <Text style={styles.helperText}>Loading product</Text>
      </AppScreen>
    );
  }

  if (!isNew && !product) {
    return (
      <AppScreen style={styles.centered}>
        <Text style={styles.error}>{error || 'Product not found.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.smallAction}>
          <Text style={styles.smallActionText}>Back to products</Text>
        </Pressable>
      </AppScreen>
    );
  }

  const currentStock = Number(inventory?.quantity ?? 0);
  const needsOpeningStock = !isNew && inventory?.createdAt === null;
  // Read mode: warn about low or no stock on an active product once its stock has been recorded.
  const warning = product && product.status === 'ACTIVE' && !needsOpeningStock ? stockWarning(currentStock, Number(product.minimumStock), product.unit) : null;
  const tax = product ? taxSummary(product) : null;
  const groupSize = product ? groupSizeLabel(product.unit, product.piecesPerUnit) : null;
  const optionRows = product ? sellingOptionRows(product, product.sellingOptions) : [];

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{isNew ? 'Add product' : product?.name}</Text>
            <Text style={styles.subtitle}>{isNew ? 'CATALOG · OWNER VIEW' : `${product?.category ? `${product.category} · ` : ''}${product?.sku} · ${product?.status.toLowerCase()}`}</Text>
          </View>
          {!isNew && !editing && can('products.update') ? (
            <Pressable onPress={() => { setPhoto({ images: product?.images, imageThumbnail: product?.imageThumbnail ?? null, imageOriginal: product?.imageOriginal ?? null }); setEditing(true); }} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>

        {error && !editing ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <ProductPhoto value={editing ? photo : { images: product?.images, imageThumbnail: product?.imageThumbnail ?? null, imageOriginal: product?.imageOriginal ?? null }} onChange={editing ? setPhoto : undefined} onEdit={!editing && can('products.update') ? (next) => { setPhoto(next ?? { images: product?.images, imageThumbnail: product?.imageThumbnail ?? null, imageOriginal: product?.imageOriginal ?? null }); setEditing(true); } : undefined} onBusy={setPhotoBusy} disabled={saving} />

        {editing && can(isNew ? 'products.create' : 'products.update') ? (
          <>
            {isNew ? (
              <View style={styles.unsavedRow}>
                <Text style={styles.unsavedBadge}>New · Unsaved</Text>
                <Text style={styles.helperText}>Added to catalog only after saving</Text>
              </View>
            ) : null}
            <View style={styles.form}>
            <Text style={styles.sectionTitle}>Item identity</Text>
            <Text style={styles.label}>Product name</Text>
            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                clearErrorOnEdit();
              }}
              style={styles.input}
              placeholder="e.g. Basmati Rice"
              placeholderTextColor="#9CA3AF"
              maxLength={160}
            />
            <Text style={styles.label}>Category (optional)</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose product category" accessibilityState={{ expanded: categoryOpen }} onPress={() => setCategoryOpen((current) => !current)} style={[styles.input, styles.categoryTrigger]}>
              <Text style={{ color: category ? '#24332A' : '#9CA3AF', flex: 1 }}>{category || 'Choose a category'}</Text><Text style={{ color: '#737B77' }}>{categoryOpen ? '▴' : '▾'}</Text>
            </Pressable>
            {categoryOpen ? <View style={styles.categoryDropdown}>
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {[...new Set([...(category && !newCategory ? [category] : []), ...categories])].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} onPress={() => { setCategory(value); setNewCategory(false); setCategoryOpen(false); clearErrorOnEdit(); }} style={[styles.categoryRow, category === value && { backgroundColor: '#EDF6F0' }]}><Text style={{ color: '#24332A', flex: 1 }}>{value}</Text>{category === value ? <Text style={{ color: '#176B50' }}>✓</Text> : null}</Pressable>)}
                {categoryLoading ? <Text style={styles.categoryNotice}>Loading categories…</Text> : categoryLoadError ? <Text style={styles.categoryNotice}>Could not load categories. You can still enter a new one.</Text> : !categories.length ? <Text style={styles.categoryNotice}>No saved categories yet.</Text> : null}
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={() => { setNewCategory(true); setCategory(''); setCategoryOpen(false); clearErrorOnEdit(); }} style={styles.categoryRow}><Text style={{ color: '#176B50', fontWeight: '600' }}>＋ Add new category</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setCategory(''); setNewCategory(false); setCategoryOpen(false); clearErrorOnEdit(); }} style={styles.categoryRow}><Text style={{ color: '#737B77' }}>No category</Text></Pressable>
            </View> : null}
            {newCategory ? <TextInput accessibilityLabel="New category name" autoFocus value={category} onChangeText={(value) => { setCategory(value); clearErrorOnEdit(); }} style={[styles.input, { marginTop: 8 }]} placeholder="New category name" placeholderTextColor="#9CA3AF" maxLength={100} /> : null}
            <Text style={styles.label}>SKU</Text>
            <TextInput
              value={sku}
              onChangeText={(value) => {
                setSku(value);
                clearErrorOnEdit();
              }}
              style={styles.input}
              placeholder="e.g. RICE-001"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={64}
            />
            <Text style={styles.label}>Barcode (optional)</Text>
            <TextInput
              value={barcode}
              onChangeText={(value) => {
                setBarcode(value);
                clearErrorOnEdit();
              }}
              style={styles.input}
              placeholder="Scan or enter barcode"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={100}
            />
            <Text style={styles.helperText}>Use a unique SKU or barcode to avoid duplicate items.</Text>

            </View>
            <View style={[styles.form, styles.formGap]}>
            <Text style={styles.sectionTitle}>Stock & transaction unit</Text>
            <Text style={styles.label}>Unit</Text>
            <View style={styles.units}>
              {productUnits.map((value) => {
                const selected = unit === value;
                return (
                  <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unitOption, selected && styles.unitSelected]}>
                    <Text style={[styles.unitText, selected && styles.unitTextSelected]}>{formatUnitLabel(value)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {unit === 'DOZEN' ? <Text style={styles.helperText}>1 dozen = 12 pieces. Retail sales can use pieces.</Text> : null}
            {['BOX', 'PACK'].includes(unit) ? <>
              <Text style={styles.label}>Pieces per {formatUnitLabel(unit)}</Text>
              <TextInput accessibilityLabel="Pieces per group" value={piecesPerUnit} onChangeText={(value) => { if (/^\d{0,6}$/.test(value)) setPiecesPerUnit(value); }} keyboardType="number-pad" placeholder="e.g. 24" style={styles.input} />
              <Text style={styles.helperText}>Set before recording opening stock to enable retail sales by piece. Prices and stock below use the selected stock unit.</Text>
            </> : null}
            </View>
            <View style={[styles.form, styles.formGap]}>
            <View style={styles.optionHeading}>
              <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Selling options</Text><Text style={styles.helperText}>Choose a unit, quantity and total price for each option.</Text></View>
              <Text style={styles.optionCount}>{sellingOptions.length}/20</Text>
            </View>
            {!sellingOptions.length ? <View style={styles.optionEmpty}><Text style={styles.optionEmptyTitle}>Make everyday sales quicker</Text><Text style={styles.optionHint}>Offer a single piece, a bundle, or a full box. Each option gets its own unit, quantity and price.</Text></View> : null}
            {sellingOptions.map((option, index) => {
              const change = (field: Exclude<keyof SellingOption, 'piecesPerUnit'>, value: string) => setSellingOptions((current) => current.map((entry, i) => i === index ? { ...entry, [field]: value, ...(field === 'unit' ? { piecesPerUnit: undefined } : {}) } : entry));
              const groupSize = unit === 'DOZEN' ? 12 : Number(piecesPerUnit) || 0;
              const choices = sellingUnitChoices(unit, unit === 'DOZEN' ? 12 : Number(piecesPerUnit) || null);
              return <View key={option.id} style={styles.optionEditor}>
                <View style={styles.optionHeading}><Text style={styles.optionNumber}>OPTION {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove selling option ${index + 1}`} onPress={() => setSellingOptions((current) => current.filter((entry) => entry.id !== option.id))} style={styles.optionRemove}><Text style={styles.optionRemoveText}>Remove</Text></Pressable></View>
                <Text style={styles.label}>Name</Text>
                <TextInput accessibilityLabel={`Selling option ${index + 1} name`} maxLength={60} value={option.name} onChangeText={(value) => change('name', value)} placeholder="e.g. Single piece or Family pack" style={[styles.input, styles.optionInput]} />
                <><Text style={styles.label}>Unit for this option</Text><View style={styles.units}>{choices.map((choice) => <Pressable key={choice} accessibilityRole="button" accessibilityState={{ selected: option.unit === choice }} onPress={() => change('unit', choice)} style={[styles.unitOption, option.unit === choice && styles.unitSelected]}><Text style={[styles.unitText, option.unit === choice && styles.unitTextSelected]}>{formatUnitLabel(choice)}</Text></Pressable>)}</View></>
                {['BOX', 'PACK'].includes(option.unit) ? <><Text style={styles.label}>Pieces in one {formatUnitLabel(option.unit)} of this option</Text><TextInput accessibilityLabel={`Selling option ${index + 1} pieces per group`} value={option.piecesPerUnit == null ? '' : String(option.piecesPerUnit)} placeholder={option.unit === unit && groupSize ? `Uses stock size: ${groupSize}` : 'e.g. 6'} keyboardType="number-pad" onChangeText={(value) => { if (/^\d{0,6}$/.test(value)) setSellingOptions((current) => current.map((entry, i) => i === index ? { ...entry, piecesPerUnit: value ? Number(value) : undefined } : entry)); }} style={[styles.input, styles.optionInput]} /><Text style={styles.optionHint}>This converts the selling box or pack into pieces for stock deduction.</Text></> : null}
                {sellingUnitConversion(unit, groupSize || null, option.unit, option.piecesPerUnit)?.perOption ? <Text style={styles.optionHint}>Custom unit: each option sold deducts one stock unit. No dimension calculation.</Text> : null}
                <View style={[styles.fieldsRow, { marginTop: 12 }]}>
                  <View style={styles.field}><Text style={styles.label}>Amount in one option ({formatUnitLabel(option.unit)})</Text><TextInput accessibilityLabel={`Selling option ${index + 1} quantity`} value={option.quantity} placeholder="e.g. 6" onChangeText={(value) => { if (/^\d*(?:\.\d{0,3})?$/.test(value)) change('quantity', value); }} keyboardType="decimal-pad" style={[styles.input, styles.optionInput]} /></View>
                  <View style={styles.field}><Text style={styles.label}>Price for this quantity</Text><View style={styles.optionPriceField}><Text style={styles.optionCurrency}>₹</Text><TextInput accessibilityLabel={`Selling option ${index + 1} price`} value={option.sellingPrice} placeholder="0.00" onChangeText={(value) => { if (/^\d*(?:\.\d{0,2})?$/.test(value)) change('sellingPrice', value); }} keyboardType="decimal-pad" style={styles.optionPriceInput} /></View></View>
                </View>
                {Number(option.quantity) > 0 && Number(option.sellingPrice) > 0 ? <View style={styles.optionPreview}><Text style={styles.optionPreviewText}>{option.quantity} {formatUnitLabel(option.unit)} for {formatMoney(Number(option.sellingPrice))}</Text><Text style={styles.optionHint}>{formatMoney(Number(option.sellingPrice) / Number(option.quantity))} / {formatUnitLabel(option.unit)}</Text></View> : null}
              </View>;
            })}
            <Pressable accessibilityRole="button" accessibilityLabel="Add another quantity and selling price" accessibilityState={{ disabled: sellingOptions.length >= 20 }} disabled={sellingOptions.length >= 20} onPress={addSellingOption} style={[styles.optionAdd, sellingOptions.length >= 20 && { opacity: 0.45 }]}><Text style={styles.optionAddText}>＋ {sellingOptions.length ? 'Add another selling option' : 'Add selling option'}</Text></Pressable>
            {sellingOptions.length > 0 ? <Text style={styles.optionHint}>All options are saved with your product.</Text> : null}
            </View>
            <View style={[styles.form, styles.formGap]}>
            <Text style={styles.sectionTitle}>Pricing & reorder level</Text>
            <Text style={styles.label}>GST rate (%)</Text><TextInput accessibilityLabel="Product GST rate" value={gstRate} onChangeText={(value) => { if (/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) setGstRate(value); }} keyboardType="decimal-pad" style={styles.input} />
            <Text style={styles.helperText}>Prices exclude GST. The configured rate is added when saving a sale or purchase; saved receipts keep their original rate.</Text>
            <Text style={styles.label}>HSN code (optional)</Text><TextInput accessibilityLabel="Product HSN code" value={hsnCode} onChangeText={(value) => { if (/^[\d ]{0,10}$/.test(value)) { setHsnCode(value); clearErrorOnEdit(); } }} keyboardType="number-pad" placeholder="e.g. 70052910" placeholderTextColor="#9CA3AF" maxLength={10} style={styles.input} />
            <Text style={styles.helperText}>4, 6 or 8 digits, printed beside this product on GST invoices.</Text>
            <View style={styles.fieldsRow}>
              <View style={styles.field}>
                <Text style={styles.label}>Purchase price</Text>
                <TextInput
                  value={purchasePrice}
                  onChangeText={(value) => {
                    if (moneyPattern.test(value)) {
                      setPurchasePrice(value);
                    }
                    clearErrorOnEdit();
                  }}
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Default price / {formatUnitLabel(unit)}</Text>
                <TextInput
                  value={sellingPrice}
                  onChangeText={(value) => {
                    if (moneyPattern.test(value)) {
                      setSellingPrice(value);
                    }
                    clearErrorOnEdit();
                  }}
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.label}>Low-stock alert level</Text>
            <TextInput
              value={minimumStock}
              onChangeText={(value) => {
                if (quantityPattern.test(value)) {
                  setMinimumStock(value);
                }
                clearErrorOnEdit();
              }}
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
            {isNew && can('inventory.adjust') ? (
              <>
                <Text style={styles.label}>Opening stock (optional)</Text>
                <TextInput
                  accessibilityLabel="Opening stock"
                  value={openingStock}
                  onChangeText={(value) => {
                    if (quantityPattern.test(value)) {
                      setOpeningStock(value);
                    }
                    clearErrorOnEdit();
                  }}
                  style={styles.input}
                  placeholder={`Quantity in ${formatUnitLabel(unit)}`}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.helperText}>Recorded as the first stock entry when the product is created. You can also add it later.</Text>
              </>
            ) : null}

            </View>
            <FormError message={error} />
            <Pressable disabled={saving || photoBusy} onPress={() => void saveProduct()} style={[styles.primaryButton, (saving || photoBusy) && styles.disabled]}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}</Text>
            </Pressable>
            {!isNew ? <Pressable onPress={cancelEditing} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel editing</Text></Pressable> : null}
          </>
        ) : (
          <>
            <View style={[styles.stockCard, warning && (warning.tone === 'out' ? styles.stockCardOut : styles.stockCardLow)]}>
              <Text style={[styles.stockLabel, warning && (warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow)]}>Current stock</Text>
              <Text style={[styles.stockValue, warning && (warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow)]}>{formatQuantity(currentStock, product?.unit ?? 'PIECE')}</Text>
              {warning ? (
                <View accessibilityRole="alert" style={styles.warningBox}>
                  <Text style={[styles.warningTitle, warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow]}>{warning.tone === 'out' ? '⚠ ' : '▼ '}{warning.title}</Text>
                  <Text style={[styles.warningText, warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow]}>{warning.message}</Text>
                </View>
              ) : null}
              <Text style={[styles.stockMeta, warning && (warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow)]}>Minimum level: {formatQuantity(Number(product?.minimumStock ?? 0), product?.unit ?? 'PIECE')}</Text>
              <Text style={[styles.stockMeta, warning && (warning.tone === 'out' ? styles.stockTextOut : styles.stockTextLow)]}>
                {product?.purchasePrice ? `Buy ${formatMoney(Number(product.purchasePrice))} · ` : ''}
                Sell {formatMoney(Number(product?.sellingPrice ?? 0))} / {formatUnitLabel(product?.unit ?? 'PIECE')}
              </Text>
            </View>

            {tax ? (
              <View style={styles.detailCard}>
                <Text style={styles.sectionTitle}>Tax & selling</Text>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>GST rate</Text><Text style={styles.detailValue}>{tax.gst}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>HSN code</Text><Text style={[styles.detailValue, !tax.hsn && styles.detailMuted]}>{tax.hsn ?? 'Not set'}</Text></View>
                {tax.priceWithGst ? <Text style={styles.helperText}>Prices exclude GST. When a bill charges GST: {tax.priceWithGst}.</Text> : null}
                {groupSize ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Group size</Text><Text style={styles.detailValue}>{groupSize}</Text></View> : null}
                <Text style={[styles.label, styles.detailHeading]}>Selling options</Text>
                {optionRows.length ? optionRows.map((option) => (
                  <View key={option.id} style={styles.optionRow}>
                    <View style={styles.historyDetails}>
                      <Text style={styles.historyType}>{option.name}</Text>
                      {option.stock ? <Text style={styles.historyDate}>{option.stock}</Text> : null}
                    </View>
                    <View style={styles.historyAmount}>
                      <Text style={styles.historyQuantity}>{option.price}</Text>
                      {option.perUnit ? <Text style={styles.historyBalance}>{option.perUnit}</Text> : null}
                    </View>
                  </View>
                )) : <Text style={styles.helperText}>No selling options. Sales use the default price.</Text>}
              </View>
            ) : null}

            {!needsOpeningStock && product?.status === 'ACTIVE' && can('inventory.adjust') ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/inventory/adjust', params: { productId: product.id } })} style={styles.adjustButton}>
                <Text style={styles.adjustText}>Adjust stock</Text>
              </Pressable>
            ) : null}

            {needsOpeningStock && can('inventory.adjust') ? (
              <View style={styles.openingCard}>
                <Text style={styles.sectionTitle}>Record opening stock</Text>
                <Text style={styles.helperText}>This creates the initial inventory ledger entry. It can only be recorded once.</Text>
                <View style={styles.openingRow}>
                  <TextInput
                    value={openingStock}
                    onChangeText={(value) => {
                      if (quantityPattern.test(value)) {
                        setOpeningStock(value);
                      }
                      clearErrorOnEdit();
                    }}
                    style={[styles.input, styles.openingInput]}
                    placeholder={`Quantity in ${formatUnitLabel(product?.unit ?? 'PIECE')}`}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />
                  <Pressable disabled={saving || openingStock === ''} onPress={() => void saveOpeningStock()} style={[styles.smallAction, (saving || openingStock === '') && styles.disabled]}>
                    <Text style={styles.smallActionText}>{saving ? 'Saving' : 'Record'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Stock history</Text>
              <Text style={styles.historyCount}>{transactions.length}</Text>
            </View>
            {transactions.length ? transactions.map((transaction) => (
              <View key={transaction.id} style={styles.historyRow}>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyType}>{inventoryMovementLabel(transaction.type)}</Text>
                  <Text style={styles.historyDate}>{formatDateTime(transaction.createdAt)}</Text>
                  {inventoryMovementNote(transaction.note) ? <Text style={styles.historyNote}>{inventoryMovementNote(transaction.note)}</Text> : null}
                </View>
                <View style={styles.historyAmount}>
                  <Text style={styles.historyQuantity}>{formatQuantity(Number(transaction.quantity), product?.unit ?? 'PIECE')}</Text>
                  <Text style={styles.historyBalance}>Balance {formatQuantity(Number(transaction.balanceAfter), product?.unit ?? 'PIECE')}</Text>
                </View>
              </View>
            )) : <Text style={styles.helperText}>No stock transactions recorded.</Text>}

            <Pressable disabled={!can(product?.status === 'INACTIVE' ? 'products.update' : 'products.delete')} onPress={toggleActive} style={[styles.deactivateButton, !can(product?.status === 'INACTIVE' ? 'products.update' : 'products.delete') && { display: 'none' }]}>
              <Text style={styles.deactivateText}>{product?.status === 'INACTIVE' ? 'Reactivate product' : 'Deactivate product'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ConfirmationDialog
        visible={!!leaveAction}
        title="Discard unsaved changes?"
        message={isNew ? 'This product has not been added to your catalog yet.' : 'Your changes to this product have not been saved.'}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setLeaveAction(null)}
        onConfirm={() => {
          if (!leaveAction) return;
          const action = leaveAction;
          setLeaveAction(null);
          navigation.dispatch(action);
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  categoryTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryDropdown: { marginTop: 6, borderWidth: 1, borderColor: '#DFE7E2', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  categoryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  categoryNotice: { padding: 14, color: '#737B77', fontSize: 12 },

  optionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionCount: { color: '#176B50', backgroundColor: '#E7F2ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: '700' },
  optionEmpty: { padding: 18, backgroundColor: '#F3F7F5', borderRadius: 12, marginTop: 16 },
  optionEmptyTitle: { color: '#24332A', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  optionHint: { color: '#737B77', fontSize: 12, lineHeight: 18, marginTop: 4 },
  optionEditor: { marginTop: 16, padding: 16, borderWidth: 1, borderColor: '#DFE7E2', backgroundColor: '#FAFCFB', borderRadius: 16 },
  optionNumber: { color: '#737B77', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  optionRemove: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  optionRemoveText: { color: '#A34838', fontSize: 12, fontWeight: '600' },
  optionInput: { backgroundColor: '#FFFFFF' },
  optionPriceField: { flexDirection: 'row', alignItems: 'center', minHeight: 49, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 12 },
  optionCurrency: { color: '#737B77', fontSize: 16, marginRight: 6 },
  optionPriceInput: { flex: 1, minWidth: 0, minHeight: 47, color: '#24332A', fontSize: 14 },
  optionPreview: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#E1E9E4', paddingTop: 12 },
  optionPreviewText: { color: '#176B50', fontSize: 14, fontWeight: '700' },
  optionAdd: { marginTop: 16, minHeight: 48, borderWidth: 1, borderStyle: 'dashed', borderColor: '#7AAE98', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F8F5', paddingHorizontal: 12 },
  optionAddText: { color: '#176B50', fontSize: 13, fontWeight: '700' },

  centered: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 40, backgroundColor: '#F5F5F5' },
  backButton: { alignSelf: 'center', paddingVertical: 10, paddingRight: 12 },
  backText: { fontSize: 27, fontWeight: '500', color: '#24332A' },
  header: { minHeight: 94, flexDirection: 'row', alignItems: 'center', marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', marginBottom: 18 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#1D2B25', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 11, marginTop: 4 },
  unsavedRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  unsavedBadge: { color: '#176B50', backgroundColor: '#E7F2ED', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, fontSize: 11, fontWeight: '800' },
  form: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 17, padding: 16 },
  formGap: { marginTop: 14 },
  sectionTitle: { color: '#24332A', fontSize: 17, fontWeight: '800' },
  label: { color: '#737B77', fontSize: 13, fontWeight: '600', marginTop: 15, marginBottom: 7 },
  input: { minHeight: 49, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 11, paddingHorizontal: 13, color: '#24332A', fontSize: 14 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  unitOption: { borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  unitSelected: { borderColor: '#176B50', backgroundColor: '#176B50' },
  unitText: { color: '#737B77', fontSize: 12, fontWeight: '600' },
  unitTextSelected: { color: '#FFFFFF' },
  fieldsRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 0 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#176B50', borderRadius: 12, marginTop: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { backgroundColor: '#FEECEC', color: '#B91C1C', borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 16 },
  notice: { backgroundColor: '#E9F9F1', color: '#0F766E', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  stockCard: { backgroundColor: '#E9F9F1', borderRadius: 16, padding: 18, marginBottom: 20 },
  stockLabel: { color: '#0F766E', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  stockValue: { color: '#0F766E', fontSize: 30, fontWeight: '800', marginTop: 8 },
  stockMeta: { color: '#0F766E', fontSize: 12, marginTop: 8 },
  stockCardLow: { backgroundColor: '#FFF6E5' },
  stockCardOut: { backgroundColor: '#FEECEC' },
  stockTextLow: { color: '#8A5300' },
  stockTextOut: { color: '#B91C1C' },
  warningBox: { marginTop: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.7)', padding: 10 },
  warningTitle: { fontSize: 13, fontWeight: '800' },
  warningText: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  detailCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 15, marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2F1' },
  detailLabel: { color: '#6B7280', fontSize: 13 },
  detailValue: { color: '#111827', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  detailMuted: { color: '#9CA3AF', fontWeight: '500' },
  detailHeading: { marginBottom: 0 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F2F1' },
  openingCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 15, marginBottom: 22 },
  helperText: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 8 },
  openingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  openingInput: { flex: 1, minWidth: 0 },
  smallAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E9F9F1', paddingHorizontal: 15 },
  smallActionText: { color: '#0F766E', fontSize: 13, fontWeight: '700' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  historyCount: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  historyDetails: { flex: 1, minWidth: 0, marginRight: 12 },
  historyType: { color: '#111827', fontSize: 13, fontWeight: '700' },
  historyNote: { color: '#374151', fontSize: 12, marginTop: 3 },
  adjustButton: { alignItems: 'center', borderWidth: 1, borderColor: '#176B50', borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  adjustText: { color: '#176B50', fontSize: 14, fontWeight: '700' },
  historyDate: { color: '#6B7280', fontSize: 11, marginTop: 4 },
  historyAmount: { alignItems: 'flex-end' },
  historyQuantity: { color: '#111827', fontSize: 12, fontWeight: '700' },
  historyBalance: { color: '#6B7280', fontSize: 10, marginTop: 4 },
  deactivateButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', marginTop: 28 },
  deactivateText: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
});
