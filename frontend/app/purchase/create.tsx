import { TransactionFinanceFields } from '@/components/transaction-finance-fields';
import { transactionTotals, validDueDate, requestKey } from '@/services/transaction-accounting';
import { saveDraft, readDraft, clearDraft, type TransactionDraft } from '@/services/transaction-drafts';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ApiError } from '@/services/api';
import { TransactionReceipt, type ReceiptData } from '@/components/transaction-receipt';
import { TransactionSaveNotice } from '@/components/transaction-save-notice';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, appColors, formatUnitLabel } from '@/components/invento-ui';
import {
  appSession,
  createPurchase,
  createSupplier,
  fetchInventory,
  fetchProducts,
  fetchSuppliers,
  type ProductRecord,
  type SupplierRecord,
} from '@/services/api';

type RouteParams = { supplierId?: string | string[] };
const paramValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

export default function CreatePurchaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const initialSupplierId = paramValue(params.supplierId);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showSupplierPicker, setShowSupplierPicker] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'credit'>('credit');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidInput, setPaidInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saveRequestId, setSaveRequestId] = useState(requestKey);
  const [draftCandidate, setDraftCandidate] = useState<TransactionDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState('');
  usePreventRemove(saving, () => {});
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [error, setError] = useState('');
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [saveOutcome, setSaveOutcome] = useState<'rejected' | 'unknown' | null>(null);
  const submitting = useRef(false);
  const discardDraftWrites = useRef(false);
  const savedBalancesForNext = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    let active = true;
    const loadFormData = async () => {
      const session = appSession.current;
      if (!session) {
        setError('Sign in before recording a purchase.');
        setLoading(false);
        return;
      }
      try {
        const [productData, inventoryData, supplierData] = await Promise.all([
          fetchProducts(session),
          fetchInventory(session),
          fetchSuppliers(session),
        ]);
        if (!active) return;
        setProducts(productData);
        setSuppliers(supplierData);
        if (initialSupplierId && supplierData.some((supplier) => supplier.id === initialSupplierId)) {
          setSupplierId(initialSupplierId);
          setShowSupplierPicker(false);
        }
        setStock(inventoryData.reduce<Record<string, number>>((balances, item) => {
          balances[item.productId] = Number(item.quantity);
          return balances;
        }, {}));
        setPrices(productData.reduce<Record<string, string>>((values, product) => {
          values[product.id] = String(product.purchasePrice ?? '');
          return values;
        }, {}));
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load purchase details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadFormData();
    return () => { active = false; };
  }, [initialSupplierId]);

  const filteredSuppliers = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    return suppliers.filter((supplier) =>
      !query || supplier.name.toLowerCase().includes(query) || supplier.phone?.toLowerCase().includes(query),
    );
  }, [supplierSearch, suppliers]);

  const categories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category?.trim()).filter((value): value is string => Boolean(value)))],
    [products],
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((product) =>
      (category === 'All' || product.category === category) &&
      (!query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) ||
        (product.barcode ?? '').toLowerCase().includes(query) || product.category?.toLowerCase().includes(query)),
    );
  }, [category, productSearch, products]);

  const purchaseItems = useMemo(
    () => products.flatMap((product) => {
      if (!Object.prototype.hasOwnProperty.call(quantities, product.id)) return [];
      const parsedQuantity = Number(quantities[product.id]);
      const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
      const price = Number(prices[product.id] ?? 0);
      return [{ product, quantity, price }];
    }),
    [products, quantities, prices],
  );
  const { subtotal, tax: taxTotal, total } = transactionTotals(purchaseItems);
  const paymentAmount = paymentMode === 'full' ? total.toFixed(2) : paymentMode === 'credit' ? '0.00' : paidInput;
  const paymentValid = (paymentMode !== 'partial' || (paidInput !== '' && Number(paidInput) > 0 && Number(paidInput) < total)) && validDueDate(paymentMode === 'full' ? '' : dueDate);
  const linesValid = purchaseItems.every((item) => item.quantity > 0 && item.price > 0 &&
    !(item.product.unit === 'PIECE' && !Number.isInteger(item.quantity)));
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  useEffect(() => {
    if (loading || draftReady || !appSession.current) return;
    let active = true;
    readDraft(appSession.current, 'purchase').then((draft) => { if (active) setDraftCandidate(draft); }).catch(() => { if (active) setDraftStorageError('Could not read your saved draft.'); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [loading, draftReady]);

  const restoreDraft = () => {
    const draft = draftCandidate;
    if (!draft) return;
    const available = new Set(products.map((product) => product.id));
    setQuantities(Object.fromEntries(Object.entries(draft.quantities).filter(([id]) => available.has(id))));
    setPrices(draft.prices); setSupplierId(draft.contactId); setShowSupplierPicker(!draft.contactId); setStep(draft.step);
    setPaymentMode(draft.paymentMode); setPaidInput(draft.paidInput); setDueDate(draft.dueDate); setPaymentMethod(draft.paymentMethod as string); setSaveRequestId(draft.requestId); setSaveOutcome(draft.outcome);
    setInvoiceNumber(draft.invoiceNumber ?? '');
    setDraftCandidate(null);
    if (Object.keys(draft.quantities).some((id) => !available.has(id))) setError('Some products are no longer active and were removed from this draft.');
  };
  const discardStoredDraft = async () => {
    const session = appSession.current;
    if (!session) return;
    try { await clearDraft(session, 'purchase'); setDraftCandidate(null); setSaveRequestId(requestKey()); } catch { setDraftStorageError('Could not discard the saved draft. Please try again.'); }
  };
  useEffect(() => {
    const session = appSession.current;
    if (!session || !draftReady || draftCandidate || loading || saving || receiptVisible || !(Object.keys(quantities).length || supplierId)) return;
    const draft: TransactionDraft = { version: 1, kind: 'purchase', requestId: saveRequestId, updatedAt: new Date().toISOString(), contactId: supplierId, contactName: selectedSupplier?.name ?? '', quantities, prices, invoiceNumber, paymentMode, paidInput, dueDate, paymentMethod, step, outcome: saveOutcome };
    const persist = () => { if (discardDraftWrites.current) return; void saveDraft(session, draft).catch(() => setDraftStorageError('Could not save this draft on your device. Keep this screen open.')); };
    const timer = setTimeout(persist, 350);
    return () => { clearTimeout(timer); persist(); };
  }, [draftReady, draftCandidate, loading, saving, receiptVisible, quantities, prices, invoiceNumber, supplierId, selectedSupplier?.name, paymentMode, paidInput, dueDate, paymentMethod, step, saveRequestId, saveOutcome]);

  const changeQuantity = (productId: string, value: string) => {
    if (!/^\d*(?:\.\d{0,3})?$/.test(value)) return;
    setQuantities((current) => ({ ...current, [productId]: value }));
    if (error) setError('');
  };

  const changePrice = (productId: string, value: string) => {
    if (!/^\d{0,10}(?:\.\d{0,2})?$/.test(value)) return;
    setPrices((current) => ({ ...current, [productId]: value }));
    if (error) setError('');
  };

  const addSupplier = async () => {
    const name = supplierName.trim();
    const session = appSession.current;
    if (!name || !session || addingSupplier) return;
    setAddingSupplier(true);
    setError('');
    try {
      const supplier = await createSupplier(session, name);
      setSuppliers((current) => [...current, supplier].sort((left, right) => left.name.localeCompare(right.name)));
      setSupplierId(supplier.id);
      setShowSupplierPicker(false);
      setSupplierName('');
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : 'Could not add supplier.');
    } finally {
      setAddingSupplier(false);
    }
  };

  const toggleProduct = (product: ProductRecord) => {
    setQuantities((current) => {
      if (Object.prototype.hasOwnProperty.call(current, product.id)) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return { ...current, [product.id]: '1' };
    });
    if (error) setError('');
  };

  const continueToQuantity = () => {
    if (!supplierId) {
      setError('Choose a supplier to continue.');
      return;
    }
    if (!purchaseItems.length) {
      setError('Add at least one product to continue.');
      return;
    }
    setError('');
    setStep(2);
  };

  const continueToReview = () => {
    if (!purchaseItems.length || !linesValid) {
      setError('Check quantities and purchase prices before reviewing this purchase.');
      return;
    }
    setError('');
    setStep(3);
  };

  const savePurchase = async () => {
    const session = appSession.current;
    if (!session || !supplierId || !purchaseItems.length || !linesValid || saving || submitting.current || receiptVisible || !paymentValid || draftCandidate) return;
    submitting.current = true;
    setSaveOutcome(null);
    setSaving(true);
    setError('');
    try {
      const savedPurchase = await createPurchase(session, {
        requestId: saveRequestId, amountPaid: paymentAmount, ...(paymentMode !== 'full' && dueDate ? { dueDate } : {}),
        supplierId,
        paymentMethod: paymentMethod as 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER',
        purchaseDate: new Date().toISOString(),
        ...(invoiceNumber.trim() ? { invoiceNumber: invoiceNumber.trim() } : {}),
        items: purchaseItems.map(({ product, quantity, price }) => ({
          productId: product.id,
          quantity: String(quantity),
          purchasePrice: price.toFixed(2),
        })),
      });
      discardDraftWrites.current = true;
      await clearDraft(session, 'purchase').catch(() => setDraftStorageError('Transaction saved, but the draft could not be cleared. Check Activity before restoring it.'));
      const refreshedInventory = await fetchInventory(session).catch(() => null);
      if (refreshedInventory) savedBalancesForNext.current = Object.fromEntries(refreshedInventory.map((item) => [item.productId, Number(item.quantity)]));
      const savedBalances = refreshedInventory ? new Map(refreshedInventory.map((item) => [item.productId, Number(item.quantity)])) : null;
      setReceiptData({ id: savedPurchase.id, kind: 'purchase', date: savedPurchase.purchaseDate, invoice: savedPurchase.invoiceNumber, contact: savedPurchase.supplier.name, total: savedPurchase.total, subtotal: savedPurchase.subtotal, taxTotal: savedPurchase.taxTotal, amountPaid: savedPurchase.amountPaid, dueDate: savedPurchase.dueDate, payments: savedPurchase.payments,  items: savedPurchase.items.map((item) => ({ id: item.id, name: products.find((product) => product.id === item.productId)?.name ?? 'Product', sku: products.find((product) => product.id === item.productId)?.sku, quantity: Number(item.quantity), label: formatUnitLabel(products.find((product) => product.id === item.productId)?.unit ?? 'PIECE'), price: item.purchasePrice == null ? undefined : Number(item.purchasePrice), gstRate: item.gstRate, taxAmount: item.taxAmount, lineTotal: item.lineTotal, stockUnit: products.find((product) => product.id === item.productId)?.unit, stockAfter: savedBalances?.get(item.productId) })) });
      setReceiptVisible(true);
    } catch (saveError: unknown) {
      setSaveOutcome(saveError instanceof ApiError && saveError.status >= 400 && saveError.status < 500 && saveError.status !== 408 ? 'rejected' : 'unknown');
      setError(saveError instanceof Error ? saveError.message : 'Could not record purchase.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const goBack = () => {
    if (submitting.current) return;
    if (step > 1) setStep(step === 3 ? 2 : 1);
    else router.back();
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color={appColors.primary} />
        <Text style={styles.helperText}>Loading products and suppliers</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable onPress={goBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{step === 3 ? 'Review purchase' : 'New purchase'}</Text>
              <Text style={styles.subtitle}>{step === 3 ? `DRAFT · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}` : 'DRAFT · BUY PRICES'}</Text>
            </View>
            <Text style={styles.moreText}>•••</Text>
          </View>
          <View style={styles.steps}>
            {(['Products', 'Quantity', 'Review'] as const).map((label, index) => {
              const value = (index + 1) as 1 | 2 | 3;
              const completed = step > value;
              const active = step === value;
              return (
                <Pressable key={label} onPress={() => { if (value < step) setStep(value); }} style={styles.step}>
                  <View style={[styles.stepNumber, active && styles.stepActive, completed && styles.stepComplete]}>
                    <Text style={[styles.stepNumberText, (active || completed) && styles.stepNumberTextActive]}>{completed ? '✓' : value}</Text>
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <ScrollView pointerEvents={saving ? 'none' : 'auto'} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error && !saveOutcome ? <Text style={styles.error}>{error}</Text> : null}
          {draftStorageError ? <Text accessibilityRole="alert" style={styles.error}>{draftStorageError}</Text> : null}
          {draftCandidate ? <View style={styles.reviewCard}><Text style={styles.sectionTitle}>Continue your saved draft?</Text><Text style={styles.productMeta}>{draftCandidate.contactName || 'No contact selected'} · {Object.keys(draftCandidate.quantities).length} items · {new Date(draftCandidate.updatedAt).toLocaleString('en-IN')}</Text><View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}><Pressable accessibilityRole="button" onPress={restoreDraft} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.changeText}>Restore draft</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void discardStoredDraft()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.changeText}>Discard saved draft</Text></Pressable></View></View> : null}
          <TransactionSaveNotice kind="purchase" saving={saving} outcome={saveOutcome} error={error} onEdit={() => setStep(2)} onActivity={() => router.push('/(tabs)/activity')} />
          {selectedSupplier && !showSupplierPicker ? (
            <View style={styles.selectedSupplier}>
              <Text style={styles.supplierGlyph}>▰</Text>
              <Text numberOfLines={1} style={styles.selectedSupplierName}>Supplier · {selectedSupplier.name}</Text>
              <Pressable onPress={() => setShowSupplierPicker(true)}><Text style={styles.changeText}>Change</Text></Pressable>
            </View>
          ) : (
            <View style={styles.supplierSection}>
              <Text style={styles.sectionTitle}>Choose supplier</Text>
              <TextInput value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Search supplier or recent names" placeholderTextColor="#7A817E" style={styles.input} />
              {filteredSuppliers.map((supplier) => (
                <Pressable key={supplier.id} onPress={() => { setSupplierId(supplier.id); setShowSupplierPicker(false); }} style={[styles.supplierOption, supplier.id === supplierId && styles.supplierOptionSelected]}>
                  <View style={styles.personGlyph}><Text style={styles.personGlyphText}>▰</Text></View>
                  <View style={styles.supplierOptionCopy}>
                    <Text style={styles.supplierOptionName}>{supplier.name}</Text>
                    <Text style={styles.supplierOptionMeta}>{supplier.phone || supplier.contactName || 'Supplier'}</Text>
                  </View>
                  {supplier.id === supplierId ? <Text style={styles.selectedMark}>✓</Text> : null}
                </Pressable>
              ))}
              <View style={styles.addSupplierRow}>
                <TextInput value={supplierName} onChangeText={setSupplierName} placeholder="New supplier name" placeholderTextColor="#7A817E" style={[styles.input, styles.newSupplierInput]} returnKeyType="done" />
                <Pressable disabled={!supplierName.trim() || addingSupplier} onPress={() => void addSupplier()} style={[styles.smallButton, (!supplierName.trim() || addingSupplier) && styles.disabled]}>
                  <Text style={styles.smallButtonText}>{addingSupplier ? 'Adding…' : 'Add'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 1 ? (
            <>
              <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput value={productSearch} onChangeText={setProductSearch} placeholder="Name, SKU, barcode or material" placeholderTextColor="#7A817E" style={styles.search} autoCapitalize="none" />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
                {categories.map((value) => (
                  <Pressable key={value} onPress={() => setCategory(value)} style={[styles.categoryChip, category === value && styles.categorySelected]}>
                    <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{value}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Products received</Text>
                <Text style={styles.count}>{purchaseItems.length} selected</Text>
              </View>
              {filteredProducts.map((product) => {
                const quantity = quantities[product.id];
                const selected = Object.prototype.hasOwnProperty.call(quantities, product.id);
                return (
                  <Pressable key={product.id} onPress={() => toggleProduct(product)} style={[styles.productCard, selected && styles.productCardSelected]}>
                    <View style={styles.productTop}>
                      <View style={styles.productGlyph}><Text style={styles.productGlyphText}>⌁</Text></View>
                      <View style={styles.productCopy}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productMeta}>{product.category ? `${product.category} · ` : ''}{product.sku}</Text>
                      </View>
                      <View style={[styles.addProductButton, selected && styles.addProductSelected]}>
                        <Text style={[styles.addProductText, selected && styles.addProductTextSelected]}>{selected ? '✓' : '+'}</Text>
                      </View>
                    </View>
                    <View style={styles.productFacts}>
                      <View style={styles.stockFact}>
                        <Text style={styles.stockValue}>{(stock[product.id] ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {formatUnitLabel(product.unit)}</Text>
                        <Text style={styles.factLabel}>Current stock</Text>
                      </View>
                      <View style={styles.priceFact}>
                        <Text style={styles.factLabel}>BUY / {formatUnitLabel(product.unit)}</Text>
                        <Text style={styles.priceValue}>{product.purchasePrice == null ? 'Hidden' : formatMoney(Number(product.purchasePrice))}</Text>
                      </View>
                    </View>
                    {selected ? <Text style={styles.addedText}>Added · {quantity} {formatUnitLabel(product.unit)}</Text> : null}
                  </Pressable>
                );
              })}
              {!filteredProducts.length ? <Text style={styles.empty}>No matching products. Try another search or category.</Text> : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <View style={styles.sectionHeading}>
                <View><Text style={styles.sectionTitle}>Quantity & purchase price</Text><Text style={styles.helperText}>Enter what arrived on this invoice.</Text></View>
                <Pressable onPress={() => setStep(1)}><Text style={styles.changeText}>Add item</Text></Pressable>
              </View>
              {purchaseItems.map(({ product, quantity, price }) => {
                const invalidPrice = price <= 0;
                const invalidQuantity = quantity <= 0 || (product.unit === 'PIECE' && !Number.isInteger(quantity));
                return (
                  <View key={product.id} style={[styles.quantityCard, (invalidPrice || invalidQuantity) && styles.quantityCardInvalid]}>
                    <View style={styles.productTop}>
                      <View style={styles.productCopy}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productMeta}>{product.sku} · Stock {stock[product.id] ?? 0} {formatUnitLabel(product.unit)}</Text>
                      </View>
                      <Pressable onPress={() => toggleProduct(product)}><Text style={styles.removeText}>×</Text></Pressable>
                    </View>
                    <View style={styles.inputRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Quantity · {formatUnitLabel(product.unit)}</Text>
                        <TextInput accessibilityLabel={`${product.name} received quantity`} value={quantities[product.id] ?? ''} onChangeText={(value) => changeQuantity(product.id, value)} keyboardType="decimal-pad" style={styles.numberInput} />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Buy rate / {formatUnitLabel(product.unit)}</Text>
                        <TextInput accessibilityLabel={`${product.name} purchase price`} value={prices[product.id] ?? ''} onChangeText={(value) => changePrice(product.id, value)} placeholder="0.00" keyboardType="decimal-pad" style={styles.numberInput} />
                      </View>
                    </View>
                    {invalidQuantity ? <Text style={styles.invalidText}>{quantity <= 0 ? 'Enter a quantity greater than zero.' : 'Enter a whole number of pieces.'}</Text> : null}
                    {invalidPrice ? <Text style={styles.invalidText}>Enter a valid purchase price.</Text> : null}
                    {product.unit === 'SQUARE_FOOT' ? (
                      <Pressable onPress={() => router.push(`/calculator/glass?productId=${encodeURIComponent(product.id)}`)} style={styles.measureLink}>
                        <Text style={styles.measureText}>Calculate from glass dimensions ›</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.lineTotal}>
                      <Text style={styles.lineTotalLabel}>Line total</Text><Text style={styles.lineTotalValue}>{formatMoney(Math.max(0, quantity * price))}</Text>
                    </View>
                  </View>
                );
              })}
              {!purchaseItems.length ? <Text style={styles.empty}>Add a product before entering quantities.</Text> : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Pressable onPress={() => setShowSupplierPicker(true)} style={styles.reviewSupplier}>
                <View style={styles.personGlyph}><Text style={styles.personGlyphText}>▰</Text></View>
                <View style={styles.supplierOptionCopy}>
                  <Text style={styles.supplierOptionMeta}>Supplier</Text>
                  <Text style={styles.supplierOptionName}>{selectedSupplier?.name ?? 'Select supplier'}</Text>
                  <Text style={styles.supplierOptionMeta}>{selectedSupplier?.phone ?? ''}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <View style={styles.reviewHeading}><Text style={styles.sectionTitle}>Items · {purchaseItems.length}</Text><Pressable onPress={() => setStep(1)}><Text style={styles.changeText}>+ Add item</Text></Pressable></View>
              {purchaseItems.map(({ product, quantity, price }) => (
                <View key={product.id} style={styles.reviewCard}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>{product.sku}</Text>
                  <View style={styles.reviewLine}>
                    <Text style={styles.reviewQuantity}>{quantity} {formatUnitLabel(product.unit)} × {formatMoney(price)} / {formatUnitLabel(product.unit)}</Text>
                    <Text style={styles.reviewTotal}>{formatMoney(quantity * price)}</Text>
                  </View>
                  <Text style={styles.projectedStock}>Stock after saving: {(stock[product.id] ?? 0) + quantity} {formatUnitLabel(product.unit)}</Text>
                </View>
              ))}
              <View style={styles.invoiceCard}>
                <Text style={styles.sectionTitle}>Invoice details</Text>
                <Text style={styles.fieldLabel}>Invoice number · optional</Text>
                <TextInput value={invoiceNumber} onChangeText={setInvoiceNumber} placeholder="Enter supplier invoice number" placeholderTextColor="#7A817E" style={styles.input} maxLength={80} />
              </View>
              <TransactionFinanceFields kind="purchase" subtotal={subtotal} tax={taxTotal} total={total} mode={paymentMode} onMode={setPaymentMode} paid={paidInput} onPaid={setPaidInput} dueDate={dueDate} onDueDate={setDueDate} method={paymentMethod} onMethod={(value) => setPaymentMethod(value as string)} />
            </>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          {step === 1 ? (
            <Pressable onPress={continueToQuantity} style={styles.submitButton}><Text style={styles.submitText}>Continue · {purchaseItems.length} item{purchaseItems.length === 1 ? '' : 's'}</Text></Pressable>
          ) : step === 2 ? (
            <Pressable onPress={continueToReview} style={styles.submitButton}><Text style={styles.submitText}>Review purchase · {formatMoney(total)}</Text></Pressable>
          ) : (
            <Pressable disabled={!linesValid || saving || !supplierId || !paymentValid || Boolean(draftCandidate)} onPress={() => void savePurchase()} style={[styles.submitButton, (!linesValid || saving || !supplierId || !paymentValid || Boolean(draftCandidate)) && styles.disabled]}>
              <Text style={styles.submitText}>{saving ? 'Saving purchase…' : saveOutcome === 'unknown' ? 'Retry the same save safely' : saveOutcome === 'rejected' ? 'Retry saving this draft' : `Save purchase · ${formatMoney(total)}`}</Text>
            </Pressable>
          )}
        </View>
        <Modal visible={receiptVisible} animationType="slide" onRequestClose={() => { setReceiptVisible(false); router.back(); }}>
          {receiptData ? <TransactionReceipt data={receiptData} onBack={() => { setReceiptVisible(false); router.back(); }} onView={() => { setReceiptVisible(false); router.replace(`/purchase/${receiptData.id}`); }} onNew={() => { discardDraftWrites.current = false; setReceiptVisible(false); router.replace(`/purchase/create`); setQuantities({}); setStep(1); setReceiptData(null); setSaveOutcome(null); setSaveRequestId(requestKey()); setPaymentMode('credit'); setPaidInput(''); setDueDate(''); setSupplierId(''); setInvoiceNumber(''); setShowSupplierPicker(true); if (savedBalancesForNext.current) setStock(savedBalancesForNext.current); }} /> : null}
        </Modal>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E1E1E1' },
  headerTop: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backButton: { width: 43, alignItems: 'flex-start', justifyContent: 'center' },
  backText: { color: '#24332A', fontSize: 32, lineHeight: 36 },
  headerCopy: { flex: 1 },
  title: { color: '#1D2B25', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#737B77', fontSize: 11, marginTop: 3, letterSpacing: 0.2 },
  moreText: { color: '#24332A', fontSize: 17, fontWeight: '800' },
  steps: { minHeight: 59, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 9 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: '#176B50' },
  stepComplete: { backgroundColor: '#176B50' },
  stepNumberText: { color: '#737B77', fontSize: 12, fontWeight: '700' },
  stepNumberTextActive: { color: '#FFFFFF' },
  stepLabel: { color: '#737B77', fontSize: 12 },
  stepLabelActive: { color: '#176B50', fontWeight: '800' },
  content: { padding: 17, paddingBottom: 24, backgroundColor: '#F5F5F5' },
  helperText: { color: '#737B77', fontSize: 12, lineHeight: 17, marginTop: 4 },
  error: { color: '#A74737', backgroundColor: '#FBECEA', borderRadius: 11, padding: 12, fontSize: 12, marginBottom: 12 },
  selectedSupplier: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 13, marginBottom: 14 },
  supplierGlyph: { color: '#176B50', fontSize: 20 },
  selectedSupplierName: { color: '#24332A', fontSize: 12, fontWeight: '600', flex: 1 },
  changeText: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  supplierSection: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E1E1E1' },
  sectionTitle: { color: '#24332A', fontSize: 16, fontWeight: '800' },
  input: { minHeight: 47, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 11, paddingHorizontal: 12, color: '#24332A', fontSize: 13, marginTop: 10 },
  supplierOption: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingVertical: 8 },
  supplierOptionSelected: { backgroundColor: '#F2F8F5' },
  personGlyph: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  personGlyphText: { color: '#176B50', fontSize: 18 },
  supplierOptionCopy: { flex: 1 },
  supplierOptionName: { color: '#24332A', fontSize: 13, fontWeight: '700' },
  supplierOptionMeta: { color: '#737B77', fontSize: 10, marginTop: 3 },
  selectedMark: { color: '#176B50', fontSize: 17, fontWeight: '800', paddingHorizontal: 8 },
  addSupplierRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  newSupplierInput: { flex: 1, marginTop: 0 },
  smallButton: { minWidth: 59, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#176B50', paddingHorizontal: 12 },
  smallButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  searchWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E1E1E1', borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, marginBottom: 13 },
  searchIcon: { color: '#737B77', fontSize: 25, marginRight: 8 },
  search: { flex: 1, color: '#24332A', fontSize: 14, paddingVertical: 11 },
  categoryList: { gap: 8, paddingBottom: 12 },
  categoryChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, backgroundColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, borderColor: '#E1E1E1' },
  categorySelected: { backgroundColor: '#176B50', borderColor: '#176B50' },
  categoryText: { color: '#737B77', fontSize: 12, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, marginBottom: 10 },
  count: { color: '#737B77', fontSize: 11 },
  productCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 16, padding: 13, marginBottom: 10 },
  productCardSelected: { borderColor: '#176B50', borderWidth: 1.5 },
  productTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productGlyph: { width: 42, height: 42, borderRadius: 11, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center' },
  productGlyphText: { color: '#65716B', fontSize: 23 },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { color: '#24332A', fontSize: 14, fontWeight: '800' },
  productMeta: { color: '#737B77', fontSize: 10, marginTop: 4 },
  addProductButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  addProductSelected: { backgroundColor: '#176B50' },
  addProductText: { color: '#176B50', fontSize: 24, lineHeight: 28 },
  addProductTextSelected: { color: '#FFFFFF', fontSize: 18 },
  productFacts: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stockFact: { flex: 1 },
  priceFact: { flex: 1 },
  stockValue: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  factLabel: { color: '#737B77', fontSize: 10, marginTop: 4 },
  priceValue: { color: '#24332A', fontSize: 12, fontWeight: '700', marginTop: 4 },
  addedText: { color: '#176B50', fontSize: 11, fontWeight: '700', marginTop: 11 },
  quantityCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginBottom: 11 },
  quantityCardInvalid: { borderColor: '#D9877B', backgroundColor: '#FFFCFB' },
  removeText: { color: '#A74737', fontSize: 25, paddingHorizontal: 5 },
  inputRow: { flexDirection: 'row', gap: 11, marginTop: 14 },
  field: { flex: 1, minWidth: 0 },
  fieldLabel: { color: '#737B77', fontSize: 10, fontWeight: '700', marginBottom: 6 },
  numberInput: { minHeight: 44, borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, backgroundColor: '#FFFFFF', color: '#24332A', paddingHorizontal: 10, fontSize: 14 },
  invalidText: { color: '#A74737', fontSize: 11, marginTop: 8 },
  measureLink: { alignSelf: 'flex-start', marginTop: 9 },
  measureText: { color: '#176B50', fontSize: 11, fontWeight: '700' },
  lineTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E9E9E9', marginTop: 12, paddingTop: 10 },
  lineTotalLabel: { color: '#737B77', fontSize: 11 },
  lineTotalValue: { color: '#24332A', fontSize: 13, fontWeight: '800' },
  empty: { color: '#737B77', backgroundColor: '#FFFFFF', borderRadius: 13, textAlign: 'center', padding: 17, fontSize: 12 },
  reviewSupplier: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E1E1E1', padding: 13 },
  chevron: { color: '#737B77', fontSize: 24 },
  reviewHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  reviewCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginBottom: 10 },
  reviewLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 11 },
  reviewQuantity: { color: '#737B77', fontSize: 11, flex: 1 },
  reviewTotal: { color: '#24332A', fontSize: 15, fontWeight: '800' },
  projectedStock: { color: '#176B50', fontSize: 10, marginTop: 10 },
  invoiceCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginTop: 4 },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E1E1E1', padding: 15, marginTop: 10 },
  totalLabel: { color: '#24332A', fontSize: 15, fontWeight: '700' },
  totalValue: { color: '#176B50', fontSize: 22, fontWeight: '800' },
  footer: { paddingHorizontal: 17, paddingTop: 10, paddingBottom: 13, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E1E1E1' },
  submitButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#176B50', borderRadius: 12 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  receiptBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(20, 31, 25, 0.4)' },
  receiptCard: { maxHeight: '85%', padding: 20, backgroundColor: '#FFFFFF', borderRadius: 19 },
  receiptIcon: { alignSelf: 'center', width: 54, height: 54, borderRadius: 27, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  receiptCheck: { color: '#176B50', fontSize: 27, fontWeight: '800' },
  receiptTitle: { color: '#24332A', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 11 },
  receiptSubtitle: { color: '#737B77', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  receiptBody: { maxHeight: 250, borderTopWidth: 1, borderTopColor: '#E1E1E1', borderBottomWidth: 1, borderBottomColor: '#E1E1E1', paddingVertical: 12, marginBottom: 14 },
  receiptText: { color: '#24332A', fontSize: 12, lineHeight: 22 },
});
