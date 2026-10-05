import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen, ConfirmationDialog, appColors, formatUnitLabel } from '@/components/invento-ui';
import {
  appSession,
  createCustomer,
  createSale,
  fetchCustomers,
  fetchInventory,
  fetchProducts,
  fetchSale,
  type CustomerRecord,
  type InventoryRecord,
  type ProductRecord,
} from '@/services/api';

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
type RouteParams = { productId?: string | string[]; quantity?: string | string[]; saleId?: string | string[]; customerId?: string | string[] };
const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];
const paramValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default function CreateSaleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const initialProductId = paramValue(params.productId);
  const initialQuantity = paramValue(params.quantity);
  const repeatSaleId = paramValue(params.saleId);
  const initialCustomerId = paramValue(params.customerId);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [category, setCategory] = useState('All');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showCustomerPicker, setShowCustomerPicker] = useState(true);
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [error, setError] = useState('');
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const clearErrorOnEdit = () => { if (error) setError(''); };

  useEffect(() => {
    let active = true;
    const loadFormData = async () => {
      const session = appSession.current;
      if (!session) {
        setError('Sign in before recording a sale.');
        setLoading(false);
        return;
      }
      try {
        const [productData, inventoryData, customerData] = await Promise.all([
          fetchProducts(session),
          fetchInventory(session),
          fetchCustomers(session),
        ]);
        if (!active) return;
        setProducts(productData);
        setCustomers(customerData);
        if (initialCustomerId && customerData.some((customer) => customer.id === initialCustomerId)) {
          setCustomerId(initialCustomerId);
          setShowCustomerPicker(false);
        }
        setStock(inventoryData.reduce<Record<string, number>>((balances, item: InventoryRecord) => {
          balances[item.productId] = Number(item.quantity);
          return balances;
        }, {}));
        setPrices(productData.reduce<Record<string, string>>((values, product) => {
          values[product.id] = String(product.sellingPrice);
          return values;
        }, {}));

        if (repeatSaleId) {
          const previous = await fetchSale(session, repeatSaleId);
          if (!active) return;
          setCustomerId(previous.customer.id);
          setShowCustomerPicker(false);
          setPaymentMethod(previous.paymentMethod as PaymentMethod);
          const activeProductIds = new Set(productData.map((product) => product.id));
          const unavailable = previous.items.filter((item) => !activeProductIds.has(item.productId));
          setQuantities(previous.items.reduce<Record<string, string>>((values, item) => {
            if (activeProductIds.has(item.productId)) values[item.productId] = String(item.quantity);
            return values;
          }, {}));
          setPrices((current) => previous.items.reduce<Record<string, string>>((values, item) => {
            if (activeProductIds.has(item.productId)) values[item.productId] = String(item.sellingPrice);
            return values;
          }, current));
          if (unavailable.length) setError('Some items from that sale are no longer active and were not added.');
        } else if (initialProductId && productData.some((product) => product.id === initialProductId)) {
          setQuantities({ [initialProductId]: initialQuantity && /^\d*(?:\.\d{0,3})?$/.test(initialQuantity) ? initialQuantity : '1' });
        }
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load sale details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadFormData();
    return () => { active = false; };
  }, [initialCustomerId, initialProductId, initialQuantity, repeatSaleId]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    const matches = customers.filter((customer) =>
      !query || customer.name.toLowerCase().includes(query) || customer.phone?.toLowerCase().includes(query),
    );
    return showAllCustomers ? matches : matches.slice(0, 5);
  }, [customerSearch, customers, showAllCustomers]);

  const categories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category?.trim()).filter((value): value is string => Boolean(value)))],
    [products],
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((product) =>
      (category === 'All' || product.category === category) &&
      (!stockOnly || (stock[product.id] ?? 0) > 0) &&
      (!query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) ||
        (product.barcode ?? '').toLowerCase().includes(query) || product.category?.toLowerCase().includes(query)),
    );
  }, [category, productSearch, products, stock, stockOnly]);

  const saleItems = useMemo(
    () => products.flatMap((product) => {
      const quantity = Number(quantities[product.id] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      return [{ product, quantity, price: Number(prices[product.id] ?? product.sellingPrice) }];
    }),
    [prices, products, quantities],
  );
  const total = saleItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const quantityError = (product: ProductRecord, quantity: number) => {
    if (quantity > (stock[product.id] ?? 0)) return `Only ${stock[product.id] ?? 0} ${formatUnitLabel(product.unit)} available.`;
    if (product.unit === 'PIECE' && !Number.isInteger(quantity)) return 'Enter a whole number of pieces.';
    return '';
  };
  const quantitiesValid = saleItems.every((item) => item.price > 0 && !quantityError(item.product, item.quantity));
  const hasChanges = Boolean(customerId || customerName.trim()) || saleItems.length > 0;
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  useEffect(() => {
    if (!hasChanges || receiptVisible || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setLeaveConfirm(true);
      return true;
    });
    return () => subscription.remove();
  }, [hasChanges, receiptVisible]);

  const changeQuantity = (productId: string, value: string) => {
    if (!/^\d*(?:\.\d{0,3})?$/.test(value)) return;
    setQuantities((current) => ({ ...current, [productId]: value }));
    clearErrorOnEdit();
  };

  const changePrice = (productId: string, value: string) => {
    if (!/^\d{0,10}(?:\.\d{0,2})?$/.test(value)) return;
    setPrices((current) => ({ ...current, [productId]: value }));
    clearErrorOnEdit();
  };

  const addCustomer = async () => {
    const name = customerName.trim();
    const session = appSession.current;
    if (!name || !session) return;
    setAddingCustomer(true);
    setError('');
    try {
      const customer = await createCustomer(session, name);
      setCustomers((current) => [...current, customer].sort((left, right) => left.name.localeCompare(right.name)));
      setCustomerId(customer.id);
      setShowCustomerPicker(false);
      setCustomerName('');
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : 'Could not add customer.');
    } finally {
      setAddingCustomer(false);
    }
  };

  const saveSale = async () => {
    const session = appSession.current;
    if (!session || !customerId || !saleItems.length || !quantitiesValid || saving) return;
    setSaving(true);
    setError('');
    try {
      const savedSale = await createSale(session, {
        customerId,
        paymentMethod,
        saleDate: new Date().toISOString(),
        items: saleItems.map(({ product, quantity, price }) => ({
          productId: product.id,
          quantity: String(quantity),
          sellingPrice: price.toFixed(2),
        })),
      });
      setSuccessMessage([
        `Sale saved · ${formatMoney(total)}`,
        `Customer: ${selectedCustomer?.name ?? 'Customer'}`,
        `Receipt: ${savedSale.invoiceNumber || savedSale.id.slice(-8).toUpperCase()}`,
        `Payment: ${paymentMethods.find((method) => method.value === paymentMethod)?.label}`,
        ...saleItems.map((item) => `${item.product.name} · ${item.quantity} ${formatUnitLabel(item.product.unit)} × ${formatMoney(item.price)}`),
      ].join('\n'));
      setReceiptVisible(true);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not record sale. Your sale is still here; review and retry.');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep((current) => (current - 1) as 1 | 2 | 3);
      return;
    }
    if (hasChanges) setLeaveConfirm(true);
    else router.back();
  };

  const continueToQuantity = () => {
    if (!customerId) {
      setError('Choose a customer to continue.');
      return;
    }
    if (!saleItems.length) {
      setError('Add at least one product to continue.');
      return;
    }
    setError('');
    setStep(2);
  };

  const continueToReview = () => {
    if (!saleItems.length || !quantitiesValid) {
      setError('Check quantities and selling prices before reviewing this sale.');
      return;
    }
    setError('');
    setStep(3);
  };

  const toggleProduct = (product: ProductRecord) => {
    setQuantities((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return { ...current, [product.id]: '1' };
    });
    clearErrorOnEdit();
  };

  if (loading) {
    return (
      <AppScreen style={styles.centered}>
        <ActivityIndicator size="large" color={appColors.primary} />
        <Text style={styles.helperText}>Loading products and customers</Text>
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
              <Text style={styles.title}>{step === 3 ? 'Review sale' : repeatSaleId ? 'Repeat sale' : 'New sale'}</Text>
              <Text style={styles.subtitle}>{step === 3 ? `DRAFT · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}` : 'DRAFT · SELL PRICES'}</Text>
            </View>
            <Pressable accessibilityLabel="Sale options" onPress={() => setLeaveConfirm(true)} style={styles.moreButton}><Text style={styles.moreText}>•••</Text></Pressable>
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

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {selectedCustomer && !showCustomerPicker ? (
            <View style={styles.selectedCustomer}>
              <Text style={styles.customerGlyph}>♙</Text>
              <Text numberOfLines={1} style={styles.selectedCustomerName}>Customer · {selectedCustomer.name}</Text>
              <Pressable onPress={() => setShowCustomerPicker(true)}><Text style={styles.changeText}>Change</Text></Pressable>
            </View>
          ) : (
            <View style={styles.customerSection}>
              <Text style={styles.sectionTitle}>Choose customer</Text>
              <TextInput value={customerSearch} onChangeText={setCustomerSearch} placeholder="Search customer or recent names" placeholderTextColor="#7A817E" style={styles.input} />
              {filteredCustomers.map((customer) => {
                const selected = customer.id === customerId;
                return (
                  <Pressable key={customer.id} onPress={() => { setCustomerId(customer.id); setShowCustomerPicker(false); }} style={[styles.customerOption, selected && styles.customerOptionSelected]}>
                    <View style={styles.personGlyph}><Text style={styles.personGlyphText}>♙</Text></View>
                    <View style={styles.customerOptionCopy}>
                      <Text style={styles.customerOptionName}>{customer.name}</Text>
                      <Text style={styles.customerOptionMeta}>{customer.phone || customer.contactName || 'Customer'}</Text>
                    </View>
                    {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
                  </Pressable>
                );
              })}
              {customers.length > 5 && !showAllCustomers ? (
                <Pressable onPress={() => setShowAllCustomers(true)} style={styles.textButton}><Text style={styles.textButtonLabel}>View all customers</Text></Pressable>
              ) : null}
              <View style={styles.addCustomerRow}>
                <TextInput value={customerName} onChangeText={setCustomerName} placeholder="New customer name" placeholderTextColor="#7A817E" style={[styles.input, styles.newCustomerInput]} returnKeyType="done" />
                <Pressable disabled={!customerName.trim() || addingCustomer} onPress={() => void addCustomer()} style={[styles.smallButton, (!customerName.trim() || addingCustomer) && styles.disabled]}>
                  <Text style={styles.smallButtonText}>{addingCustomer ? 'Adding…' : 'Add'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 1 ? (
            <>
              <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput value={productSearch} onChangeText={(value) => { setProductSearch(value); clearErrorOnEdit(); }} placeholder="Name, SKU, barcode or material" placeholderTextColor="#7A817E" style={styles.search} autoCapitalize="none" />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
                {categories.map((value) => (
                  <Pressable key={value} onPress={() => setCategory(value)} style={[styles.categoryChip, category === value && styles.categorySelected]}>
                    <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{value}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Recently sold</Text>
                <Pressable onPress={() => setStockOnly((current) => !current)} style={[styles.stockOnly, stockOnly && styles.stockOnlyActive]}>
                  <Text style={[styles.stockOnlyText, stockOnly && styles.stockOnlyTextActive]}>☷  {stockOnly ? 'In stock only' : 'All stock'}</Text>
                </Pressable>
              </View>
              {filteredProducts.map((product) => {
                const available = stock[product.id] ?? 0;
                const quantity = quantities[product.id];
                return (
                  <Pressable key={product.id} onPress={() => toggleProduct(product)} style={[styles.productCard, Boolean(quantity) && styles.productCardSelected]}>
                    <View style={styles.productTop}>
                      <View style={styles.productGlyph}><Text style={styles.productGlyphText}>⌁</Text></View>
                      <View style={styles.productCopy}>
                        <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
                        <Text numberOfLines={1} style={styles.productMeta}>{product.category ? `${product.category} · ` : ''}{product.sku}</Text>
                      </View>
                      <View style={[styles.addProductButton, Boolean(quantity) && styles.addProductSelected]}>
                        <Text style={[styles.addProductText, Boolean(quantity) && styles.addProductTextSelected]}>{quantity ? '✓' : '+'}</Text>
                      </View>
                    </View>
                    <View style={styles.productFacts}>
                      <View style={styles.stockFact}>
                        <Text style={styles.stockValue}>{available.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {formatUnitLabel(product.unit)}</Text>
                        <Text style={styles.factLabel}>{available > 0 ? 'Available' : 'Out of stock'}</Text>
                      </View>
                      {product.purchasePrice != null ? (
                        <View style={styles.priceFact}>
                          <Text style={styles.factLabel}>BUY / {formatUnitLabel(product.unit)}</Text>
                          <Text style={styles.priceValue}>{formatMoney(Number(product.purchasePrice))}</Text>
                        </View>
                      ) : null}
                      <View style={styles.priceFact}>
                        <Text style={styles.factLabel}>SELL / {formatUnitLabel(product.unit)}</Text>
                        <Text style={styles.sellValue}>{formatMoney(Number(product.sellingPrice))}</Text>
                      </View>
                    </View>
                    {quantity ? <Text style={styles.addedText}>Added · {quantity} {formatUnitLabel(product.unit)}</Text> : null}
                  </Pressable>
                );
              })}
              {!filteredProducts.length ? <Text style={styles.empty}>No matching products. Try another search or category.</Text> : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <View style={styles.sectionHeading}>
                <View><Text style={styles.sectionTitle}>Set quantity & price</Text><Text style={styles.helperText}>Confirm the unit and sell rate for each item.</Text></View>
                <Pressable onPress={() => setStep(1)}><Text style={styles.changeText}>Add item</Text></Pressable>
              </View>
              {!saleItems.length ? <Text style={styles.empty}>Add a product before entering quantities.</Text> : null}
              {saleItems.map(({ product, quantity, price }) => {
                const invalidMessage = quantityError(product, quantity);
                return (
                  <View key={product.id} style={[styles.quantityCard, invalidMessage && styles.quantityCardInvalid]}>
                    <View style={styles.productHeader}>
                      <View style={styles.productCopy}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productMeta}>{product.sku} · {stock[product.id] ?? 0} {formatUnitLabel(product.unit)} available</Text>
                      </View>
                      <Pressable onPress={() => toggleProduct(product)}><Text style={styles.removeText}>×</Text></Pressable>
                    </View>
                    <View style={styles.inputRow}>
                      <View style={styles.quantityField}>
                        <Text style={styles.fieldLabel}>Quantity · {formatUnitLabel(product.unit)}</Text>
                        <View style={styles.quantityControl}>
                          <Pressable accessibilityLabel={`Decrease ${product.name} quantity`} onPress={() => changeQuantity(product.id, String(Math.max(0, quantity - (product.unit === 'PIECE' ? 1 : 0.5))))} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable>
                          <TextInput accessibilityLabel={`${product.name} quantity`} value={quantities[product.id] ?? ''} onChangeText={(value) => changeQuantity(product.id, value)} keyboardType="decimal-pad" style={styles.quantityInput} />
                          <Pressable accessibilityLabel={`Increase ${product.name} quantity`} onPress={() => changeQuantity(product.id, String(quantity + (product.unit === 'PIECE' ? 1 : 0.5)))} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable>
                        </View>
                      </View>
                      <View style={styles.priceField}>
                        <Text style={styles.fieldLabel}>Sell rate / {formatUnitLabel(product.unit)}</Text>
                        <TextInput value={prices[product.id] ?? ''} onChangeText={(value) => changePrice(product.id, value)} placeholder="0.00" keyboardType="decimal-pad" style={styles.priceInput} />
                      </View>
                    </View>
                    {invalidMessage ? <Text style={styles.invalidText}>{invalidMessage}</Text> : null}
                    {product.unit === 'SQUARE_FOOT' ? (
                      <Pressable onPress={() => router.push(`/calculator/glass?productId=${encodeURIComponent(product.id)}`)} style={styles.measureLink}>
                        <Text style={styles.measureText}>Calculate from glass dimensions ›</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.lineTotal}>
                      <Text style={styles.lineTotalLabel}>Line total</Text>
                      <Text style={styles.lineTotalValue}>{formatMoney(quantity * price)}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Pressable onPress={() => { setStep(1); setShowCustomerPicker(true); }} style={styles.reviewCustomer}>
                <View style={styles.personGlyph}><Text style={styles.personGlyphText}>♙</Text></View>
                <View style={styles.customerOptionCopy}>
                  <Text style={styles.customerOptionMeta}>Customer</Text>
                  <Text style={styles.customerOptionName}>{selectedCustomer?.name ?? 'Select customer'}</Text>
                  <Text style={styles.customerOptionMeta}>{selectedCustomer?.phone ?? selectedCustomer?.contactName ?? ''}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <View style={styles.reviewHeading}><Text style={styles.sectionTitle}>Items · {saleItems.length}</Text><Pressable onPress={() => setStep(1)}><Text style={styles.changeText}>+ Add item</Text></Pressable></View>
              {saleItems.map(({ product, quantity, price }) => (
                <View key={product.id} style={styles.reviewCard}>
                  <Text style={styles.reviewProductName}>{product.name}</Text>
                  <Text style={styles.productMeta}>{product.sku}</Text>
                  <View style={styles.reviewLine}>
                    <Text style={styles.reviewQuantity}>{quantity} {formatUnitLabel(product.unit)} × {formatMoney(price)} / {formatUnitLabel(product.unit)}</Text>
                    <Text style={styles.reviewTotal}>{formatMoney(quantity * price)}</Text>
                  </View>
                  <Text style={styles.projectedStock}>
                    Projected stock after saving: {Math.max(0, (stock[product.id] ?? 0) - quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {formatUnitLabel(product.unit)}
                    {product.unit === 'PIECE' ? ' · Whole units confirmed' : ''}
                  </Text>
                </View>
              ))}
              <View style={styles.paymentCard}>
                <Text style={styles.sectionTitle}>Payment method</Text>
                <View style={styles.paymentList}>
                  {paymentMethods.map((method) => (
                    <Pressable key={method.value} onPress={() => setPaymentMethod(method.value)} style={[styles.paymentOption, paymentMethod === method.value && styles.paymentOptionSelected]}>
                      <Text style={[styles.paymentText, paymentMethod === method.value && styles.paymentTextSelected]}>{method.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total amount</Text>
                  <Text style={styles.totalValue}>{formatMoney(total)}</Text>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {step === 1 ? (
            <Pressable onPress={continueToQuantity} style={styles.submitButton}>
              <Text style={styles.submitText}>Continue · {saleItems.length} item{saleItems.length === 1 ? '' : 's'}</Text>
            </Pressable>
          ) : step === 2 ? (
            <Pressable onPress={continueToReview} style={styles.submitButton}>
              <Text style={styles.submitText}>Review sale · {formatMoney(total)}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={!quantitiesValid || saving} onPress={() => void saveSale()} style={[styles.submitButton, (!quantitiesValid || saving) && styles.disabled]}>
              <Text style={styles.submitText}>{saving ? 'Saving sale…' : `Save sale · ${formatMoney(total)}`}</Text>
            </Pressable>
          )}
        </View>

        <Modal visible={receiptVisible} transparent animationType="slide" onRequestClose={() => setReceiptVisible(false)}>
          <View style={styles.receiptBackdrop}>
            <View style={styles.receiptCard}>
              <View style={styles.receiptIcon}><Text style={styles.receiptCheck}>✓</Text></View>
              <Text style={styles.receiptTitle}>Sale saved</Text>
              <Text style={styles.receiptSubtitle}>Inventory updated successfully</Text>
              <ScrollView style={styles.receiptBody}><Text style={styles.receiptText}>{successMessage}</Text></ScrollView>
              <Pressable onPress={() => { setReceiptVisible(false); router.back(); }} style={styles.submitButton}>
                <Text style={styles.submitText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <ConfirmationDialog
          visible={leaveConfirm}
          title="Leave this sale?"
          message="Your selected customer and items will be discarded."
          confirmLabel="Leave sale"
          cancelLabel="Keep editing"
          onCancel={() => setLeaveConfirm(false)}
          onConfirm={() => { setLeaveConfirm(false); router.back(); }}
        />
      </View>
    </AppScreen>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
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
  moreButton: { width: 34, alignItems: 'flex-end', paddingVertical: 8 },
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
  selectedCustomer: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 13, marginBottom: 14 },
  customerGlyph: { color: '#176B50', fontSize: 20 },
  selectedCustomerName: { color: '#24332A', fontSize: 12, fontWeight: '600', flex: 1 },
  changeText: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  customerSection: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E1E1E1' },
  sectionTitle: { color: '#24332A', fontSize: 16, fontWeight: '800' },
  input: { minHeight: 47, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 11, paddingHorizontal: 12, color: '#24332A', fontSize: 13, marginTop: 10 },
  customerOption: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingVertical: 8 },
  customerOptionSelected: { backgroundColor: '#F2F8F5' },
  personGlyph: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#E7F2ED', alignItems: 'center', justifyContent: 'center' },
  personGlyphText: { color: '#176B50', fontSize: 18 },
  customerOptionCopy: { flex: 1 },
  customerOptionName: { color: '#24332A', fontSize: 13, fontWeight: '700' },
  customerOptionMeta: { color: '#737B77', fontSize: 10, marginTop: 3 },
  selectedMark: { color: '#176B50', fontSize: 17, fontWeight: '800', paddingHorizontal: 8 },
  textButton: { paddingVertical: 10, alignItems: 'center' },
  textButtonLabel: { color: '#176B50', fontSize: 11, fontWeight: '700' },
  addCustomerRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  newCustomerInput: { flex: 1, marginTop: 0 },
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
  stockOnly: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1' },
  stockOnlyActive: { backgroundColor: '#E7F2ED', borderColor: '#E7F2ED' },
  stockOnlyText: { color: '#737B77', fontSize: 10, fontWeight: '700' },
  stockOnlyTextActive: { color: '#176B50' },
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
  priceFact: { flex: 1, alignItems: 'flex-start' },
  stockValue: { color: '#176B50', fontSize: 12, fontWeight: '800' },
  factLabel: { color: '#737B77', fontSize: 10, marginTop: 4 },
  priceValue: { color: '#24332A', fontSize: 12, fontWeight: '700', marginTop: 4 },
  sellValue: { color: '#176B50', fontSize: 12, fontWeight: '800', marginTop: 4 },
  addedText: { color: '#176B50', fontSize: 11, fontWeight: '700', marginTop: 11 },
  quantityCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginBottom: 11 },
  quantityCardInvalid: { borderColor: '#D9877B', backgroundColor: '#FFFCFB' },
  productHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeText: { color: '#A74737', fontSize: 25, paddingHorizontal: 5 },
  inputRow: { flexDirection: 'row', gap: 11, marginTop: 14 },
  quantityField: { flex: 1.1, minWidth: 0 },
  priceField: { flex: 1, minWidth: 0 },
  fieldLabel: { color: '#737B77', fontSize: 10, fontWeight: '700', marginBottom: 6 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, overflow: 'hidden' },
  stepButton: { width: 35, height: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F3F3' },
  stepText: { color: '#176B50', fontSize: 19, fontWeight: '700' },
  quantityInput: { flex: 1, minWidth: 0, height: 43, textAlign: 'center', color: '#24332A', fontSize: 14, paddingHorizontal: 3 },
  priceInput: { minHeight: 43, borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, paddingHorizontal: 10, color: '#24332A', fontSize: 13 },
  invalidText: { color: '#A74737', fontSize: 11, marginTop: 9 },
  measureLink: { marginTop: 9, alignSelf: 'flex-start' },
  measureText: { color: '#176B50', fontSize: 11, fontWeight: '700' },
  lineTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E9E9E9', marginTop: 12, paddingTop: 10 },
  lineTotalLabel: { color: '#737B77', fontSize: 11 },
  lineTotalValue: { color: '#24332A', fontSize: 13, fontWeight: '800' },
  empty: { color: '#737B77', backgroundColor: '#FFFFFF', borderRadius: 13, textAlign: 'center', padding: 17, fontSize: 12 },
  reviewCustomer: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E1E1E1', padding: 13 },
  chevron: { color: '#737B77', fontSize: 24 },
  reviewHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  reviewCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginBottom: 10 },
  reviewProductName: { color: '#24332A', fontSize: 15, fontWeight: '800' },
  reviewLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 11 },
  reviewQuantity: { color: '#737B77', fontSize: 11, flex: 1 },
  reviewTotal: { color: '#24332A', fontSize: 15, fontWeight: '800' },
  projectedStock: { color: '#176B50', fontSize: 10, marginTop: 10 },
  paymentCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 15, padding: 14, marginTop: 4 },
  paymentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  paymentOption: { minWidth: 66, alignItems: 'center', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  paymentOptionSelected: { backgroundColor: '#E7F2ED', borderColor: '#176B50' },
  paymentText: { color: '#737B77', fontSize: 11 },
  paymentTextSelected: { color: '#176B50', fontWeight: '800' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E1E1E1', marginTop: 16, paddingTop: 14 },
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
