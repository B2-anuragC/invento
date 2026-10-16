import { Ionicons } from "@expo/vector-icons";
import { sellingUnitConversion } from "@invento/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActionButton,
  AppScreen,
  ConfirmationDialog,
  formatUnitLabel,
} from "@/components/invento-ui";
import { TransactionFinanceFields } from "@/components/transaction-finance-fields";
import { TransactionSaveNotice } from "@/components/transaction-save-notice";
import {
  TransactionReceipt,
  type ReceiptData,
} from "@/components/transaction-receipt";
import {
  ApiError,
  appSession,
  createCustomer,
  createSale,
  fetchCustomers,
  fetchInventory,
  fetchProducts,
  type CreateSaleInput,
  type CustomerRecord,
  type ProductRecord,
} from "@/services/api";
import {
  requestKey,
  transactionTotals,
  validDueDate,
} from "@/services/transaction-accounting";

type Line = {
  productId: string;
  optionId?: string;
  quantity: string;
  price: string;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );

export default function QuickBillScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width / fontScale < 480;
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [panel, setPanel] = useState<"customer" | "payment" | "scanner" | null>(
    null,
  );
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"full" | "partial" | "credit">("full");
  const [paid, setPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] =
    useState<CreateSaleInput["paymentMethod"]>("CASH");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [outcome, setOutcome] = useState<"rejected" | "unknown" | null>(null);
  const [leaveAction, setLeaveAction] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  const requestId = useRef(requestKey());
  const pendingInput = useRef<CreateSaleInput | null>(null);
  const submitting = useRef(false);
  const scanned = useRef(false);
  const locked = saving || outcome === "unknown";
  const dirty = !receipt && (lines.length > 0 || Boolean(customerId));
  usePreventRemove(dirty || saving, ({ data }) => {
    if (!submitting.current) setLeaveAction(data.action);
  });

  useEffect(() => {
    let active = true;
    const session = appSession.current;
    setLoading(true);
    setLoadError("");
    if (!session) {
      setLoadError("Sign in before creating a bill.");
      setLoading(false);
      return;
    }
    Promise.all([
      fetchProducts(session),
      fetchCustomers(session),
      fetchInventory(session),
    ])
      .then(([p, c, i]) => {
        if (!active) return;
        setProducts(p);
        setCustomers(c);
        setStock(
          Object.fromEntries(
            i.map((item) => [item.productId, Number(item.quantity)]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Could not load bill details.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const items = lines.flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return [];
    const option = product.sellingOptions?.find((o) => o.id === line.optionId);
    return [
      {
        ...line,
        product,
        option,
        unit: option?.unit ?? product.unit,
        quantity: Number(line.quantity),
        price: Number(line.price),
      },
    ];
  });
  const totals = transactionTotals(items);
  const customer = customers.find((c) => c.id === customerId);
  const used: Record<string, number> = {};
  const lineErrors: string[] = items.map((item) => {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity >= 1e9
    )
      return "Enter a quantity greater than zero.";
    if (!Number.isFinite(item.price) || item.price <= 0)
      return "Enter a price greater than zero.";
    if (item.option && !Number.isInteger(item.quantity))
      return "Selling options need a whole quantity.";
    const conversion = sellingUnitConversion(
      item.product.unit,
      item.product.piecesPerUnit,
      item.unit,
      item.option?.piecesPerUnit,
    );
    if (!conversion)
      return "This selling option needs a valid stock conversion.";
    const movement =
      (item.quantity *
        (conversion.perOption ? 1 : Number(item.option?.quantity ?? 1)) *
        conversion.numerator) /
      conversion.denominator;
    const pieces =
      movement *
      (conversion.unit === "PIECE" ? 1 : (item.product.piecesPerUnit ?? 1));
    if (
      (item.product.piecesPerUnit || item.product.unit === "PIECE") &&
      Math.abs(pieces - Math.round(pieces)) > 1e-8
    )
      return "Enter a quantity representing whole pieces.";
    if (Math.abs(movement * 1000 - Math.round(movement * 1000)) > 1e-7)
      return "Quantity exceeds supported stock precision.";
    used[item.productId] =
      (used[item.productId] ?? 0) +
      movement /
        (conversion.unit === "PIECE" ? (item.product.piecesPerUnit ?? 1) : 1);
    return "";
  });
  items.forEach((item, index) => {
    if ((used[item.productId] ?? 0) > (stock[item.productId] ?? 0) + 1e-9)
      lineErrors[index] =
        `Only ${stock[item.productId] ?? 0} ${formatUnitLabel(item.product.unit)} available across all bill lines.`;
  });
  const paymentValid =
    validDueDate(mode === "full" ? "" : dueDate) &&
    (mode !== "partial" || (Number(paid) > 0 && Number(paid) < totals.total));
  const valid =
    totals.total <= 999999999999.99 &&
    !loading &&
    !loadError &&
    !!customerId &&
    items.length > 0 &&
    !lineErrors.some(Boolean) &&
    paymentValid;
  const query = search.trim().toLowerCase();
  const matches = products.filter(
    (p) =>
      !query ||
      [p.name, p.sku, p.barcode, p.category].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const edit = (index: number, patch: Partial<Line>) => {
    if (locked) return;
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    setError("");
    setOutcome(null);
  };
  const add = (product: ProductRecord, optionId?: string) => {
    if (locked) return;
    const index = lines.findIndex((line) => line.productId === product.id);
    if (index >= 0 && lines[index].optionId !== optionId)
      edit(index, {
        optionId,
        quantity: "1",
        price: String(
          product.sellingOptions?.find((o) => o.id === optionId)
            ?.sellingPrice ?? product.sellingPrice,
        ),
      });
    else if (index >= 0)
      edit(index, { quantity: String(Number(lines[index].quantity || 0) + 1) });
    else
      setLines((current) => [
        ...current,
        {
          productId: product.id,
          optionId,
          quantity: "1",
          price: String(
            product.sellingOptions?.find((o) => o.id === optionId)
              ?.sellingPrice ?? product.sellingPrice,
          ),
        },
      ]);
    setSearch("");
    setError("");
  };
  const addCustomer = async () => {
    const session = appSession.current;
    if (!session || !customerSearch.trim() || addingCustomer) return;
    setAddingCustomer(true);
    setError("");
    try {
      const c = await createCustomer(session, customerSearch.trim());
      setCustomers((current) => [...current, c]);
      setCustomerId(c.id);
      setPanel(null);
      setCustomerSearch("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add customer.",
      );
    } finally {
      setAddingCustomer(false);
    }
  };
  const save = async () => {
    const session = appSession.current;
    if (
      !session ||
      submitting.current ||
      receipt ||
      (!pendingInput.current && !valid)
    )
      return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setOutcome(null);
    const input: CreateSaleInput = pendingInput.current ?? {
      requestId: requestId.current,
      customerId,
      paymentMethod: method,
      amountPaid:
        mode === "full"
          ? totals.total.toFixed(2)
          : mode === "credit"
            ? "0.00"
            : paid,
      ...(mode !== "full" && dueDate ? { dueDate } : {}),
      saleDate: new Date().toISOString(),
      items: items.map((item) => ({
        productId: item.productId,
        sellingOptionId: item.optionId,
        unit: item.unit,
        quantity: String(item.quantity),
        sellingPrice: item.price.toFixed(2),
      })),
    };
    pendingInput.current = input;
    try {
      const saved = await createSale(session, input);
      setReceipt({
        id: saved.id,
        kind: "sale",
        date: saved.saleDate,
        invoice: saved.invoiceNumber,
        contact: saved.customer.name,
        contactPhone: saved.customer.phone,
        total: saved.total,
        subtotal: saved.subtotal,
        taxTotal: saved.taxTotal,
        amountPaid: saved.amountPaid,
        dueDate: saved.dueDate,
        payments: saved.payments,
        paymentMethod: saved.paymentMethod,
        items: saved.items.map((item) => ({
          id: item.id,
          name:
            products.find((p) => p.id === item.productId)?.name ??
            item.product?.name ??
            "Product",
          sku: products.find((p) => p.id === item.productId)?.sku,
          quantity: Number(item.quantity),
          label: item.optionName ?? formatUnitLabel(item.unit ?? "PIECE"),
          price: Number(item.sellingPrice),
          gstRate: item.gstRate,
          taxAmount: item.taxAmount,
          lineTotal: item.lineTotal,
        })),
      });
      pendingInput.current = null;
    } catch (cause) {
      const rejected =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      setOutcome(rejected ? "rejected" : "unknown");
      if (rejected) {
        pendingInput.current = null;
        requestId.current = requestKey();
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm this bill. Retry safely.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  const icon = (
    name: React.ComponentProps<typeof Ionicons>["name"],
    label: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.icon, disabled && styles.disabled]}
    >
      <Ionicons name={name} color="#243B31" size={20} />
    </Pressable>
  );

  if (receipt)
    return (
      <TransactionReceipt
        data={receipt}
        onBack={() => router.back()}
        onNew={() => {
          setReceipt(null);
          setLines([]);
          setCustomerId("");
          setSearch("");
          setPaid("");
          setDueDate("");
          setMode("full");
          setMethod("CASH");
          requestId.current = requestKey();
          setRetry((n) => n + 1);
        }}
      />
    );

  return (
    <AppScreen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          {icon("arrow-back", "Back to sales", () => router.back(), saving)}
          <View style={styles.fill}>
            <Text style={styles.title}>Quick bill</Text>
            <Text style={styles.meta}>
              Invento
              {customer ? ` · ${customer.name}` : " · Create a sale in seconds"}
            </Text>
          </View>
        </View>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading bill details"
              color="#176B50"
            />
          ) : loadError ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                {loadError}
              </Text>
              <ActionButton
                title="Try again"
                onPress={() => setRetry((n) => n + 1)}
              />
            </View>
          ) : (
            <>
              <View style={styles.search}>
                <Ionicons name="search-outline" size={21} color="#737B77" />
                <TextInput
                  style={styles.searchInput}
                  accessibilityLabel="Search products"
                  placeholder="Name, SKU, barcode or material"
                  placeholderTextColor="#737B77"
                  value={search}
                  editable={!locked}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
                {icon(
                  "scan-outline",
                  "Scan barcode",
                  () => {
                    scanned.current = false;
                    setPanel("scanner");
                  },
                  locked,
                )}
              </View>
              {query ? (
                <View style={styles.card}>
                  <Text style={styles.bold}>Products · {matches.length}</Text>
                  <ScrollView
                    style={{ maxHeight: 260 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {matches.length ? (
                      matches.map((p) => (
                        <View key={p.id} style={styles.result}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${p.name}`}
                            disabled={locked}
                            onPress={() => add(p)}
                          >
                            <Text style={styles.bold}>{p.name}　＋</Text>
                            <Text style={styles.meta}>
                              {p.sku} · {stock[p.id] ?? 0}{" "}
                              {formatUnitLabel(p.unit)} available ·{" "}
                              {money(Number(p.sellingPrice))}
                            </Text>
                          </Pressable>
                          {p.sellingOptions?.map((o) => (
                            <Pressable
                              accessibilityRole="button"
                              key={o.id}
                              disabled={locked}
                              onPress={() => add(p, o.id)}
                              style={styles.option}
                            >
                              <Text style={styles.green}>
                                ＋ {o.name} · {money(Number(o.sellingPrice))}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.meta}>
                        No matching products. Try a different name or barcode.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={locked}
                style={[styles.customer, styles.row]}
                onPress={() => setPanel("customer")}
              >
                <Ionicons name="person-outline" size={21} color="#176B50" />
                <Text style={[styles.body, styles.fill]}>
                  {customer ? `Customer · ${customer.name}` : "Choose customer"}
                </Text>
                <Text style={styles.green}>
                  {customer ? "Change" : "Select"}
                </Text>
              </Pressable>
              <Text style={styles.section}>Bill items</Text>
              {!items.length ? (
                <View style={styles.card}>
                  <Ionicons name="receipt-outline" size={28} color="#176B50" />
                  <Text style={styles.bold}>Start your bill</Text>
                  <Text style={styles.meta}>
                    Search or scan a product to add it. Adjust quantity and
                    price here.
                  </Text>
                </View>
              ) : null}
              {items.map((item, index) => (
                <View
                  key={`${item.productId}:${item.optionId ?? ""}`}
                  style={styles.card}
                >
                  <View
                    style={[
                      styles.row,
                      styles.itemRow,
                      compact && styles.itemRowCompact,
                    ]}
                  >
                    <View
                      style={[
                        styles.itemDetails,
                        compact && styles.itemDetailsCompact,
                      ]}
                    >
                      <Text style={styles.bold}>
                        {item.product.name}
                        {item.option ? ` · ${item.option.name}` : ""}
                      </Text>
                      <Text style={styles.meta}>
                        {item.product.sku}
                        {item.option ? " · Fixed option price" : ""}
                      </Text>
                      <View style={styles.row}>
                        <Text style={styles.meta}>
                          Sell / {formatUnitLabel(item.unit)}
                        </Text>
                        <TextInput
                          accessibilityLabel={`Price for ${item.product.name}${item.option ? ` ${item.option.name}` : ""}`}
                          editable={!locked && !item.option}
                          keyboardType="decimal-pad"
                          value={lines[index].price}
                          onChangeText={(value) => {
                            if (/^\d{0,10}(?:\.\d{0,2})?$/.test(value))
                              edit(index, { price: value });
                          }}
                          style={styles.price}
                        />
                      </View>
                    </View>
                    <View style={styles.itemControls}>
                      <View style={styles.row}>
                        {icon(
                          "remove",
                          `Decrease ${item.product.name}`,
                          () =>
                            edit(index, {
                              quantity: String(
                                Math.max(
                                  0,
                                  Math.round((item.quantity - 1) * 1000) / 1000,
                                ),
                              ),
                            }),
                          locked,
                        )}
                        <TextInput
                          accessibilityLabel={`Quantity for ${item.product.name}${item.option ? ` ${item.option.name}` : ""}`}
                          keyboardType="decimal-pad"
                          editable={!locked}
                          value={lines[index].quantity}
                          onChangeText={(value) => {
                            if (/^\d{0,9}(?:\.\d{0,3})?$/.test(value))
                              edit(index, { quantity: value });
                          }}
                          style={styles.quantity}
                        />
                        {icon(
                          "add",
                          `Increase ${item.product.name}`,
                          () =>
                            edit(index, {
                              quantity: String(
                                Math.round((item.quantity + 1) * 1000) / 1000,
                              ),
                            }),
                          locked,
                        )}
                      </View>
                      <View style={styles.row}>
                        <Text style={styles.meta}>Line total</Text>
                        <Text style={styles.bold}>
                          {money(item.quantity * item.price)}
                        </Text>
                      </View>
                    </View>
                    {icon(
                      "close",
                      `Remove ${item.product.name}`,
                      () =>
                        setLines((current) =>
                          current.filter((_, i) => i !== index),
                        ),
                      locked,
                    )}
                  </View>
                  {lineErrors[index] ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      {lineErrors[index]}
                    </Text>
                  ) : null}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={locked}
                onPress={() => setPanel("payment")}
                style={[styles.card, styles.row]}
              >
                <View style={styles.fill}>
                  <Text style={styles.meta}>Payment &amp; details</Text>
                  <Text style={styles.bold}>
                    {method.replaceAll("_", " ")} ·{" "}
                    {mode === "full"
                      ? "Fully paid"
                      : mode === "partial"
                        ? "Partial"
                        : "Credit"}
                  </Text>
                  {!paymentValid ? (
                    <Text style={styles.error}>Check payment details</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={22} color="#737B77" />
              </Pressable>
            </>
          )}
          <TransactionSaveNotice
            kind="sale"
            saving={saving}
            outcome={outcome}
            error={error}
            onEdit={() => setOutcome(null)}
            onActivity={() => router.push("/(tabs)/sales")}
          />
          {error && !outcome ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.summary}>
            <Text style={styles.body}>
              {items.length} item{items.length === 1 ? "" : "s"} selected
            </Text>
            <Text style={styles.meta}>Before GST</Text>
            <View style={styles.row}>
              <Text style={styles.meta}>Subtotal (excl. GST)</Text>
              <Text style={styles.body}>{money(totals.subtotal)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>GST · Item rates</Text>
              <Text style={styles.body}>{money(totals.tax)}</Text>
            </View>
            <View style={[styles.row, styles.total]}>
              <Text style={styles.bold}>Total amount</Text>
              <Text style={styles.amount}>{money(totals.total)}</Text>
            </View>
            <Text style={styles.meta}>
              Tax-inclusive total · GST configured per item
            </Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <ActionButton
            title={
              saving
                ? "Saving bill…"
                : outcome === "unknown"
                  ? "Retry same bill safely"
                  : `✓  Save bill · ${money(totals.total)}`
            }
            disabled={saving || (!valid && outcome !== "unknown")}
            onPress={() => void save()}
          />
        </View>
        <Modal
          visible={panel !== null}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!addingCustomer) setPanel(null);
          }}
        >
          <KeyboardAvoidingView
            style={styles.backdrop}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View
              style={[
                styles.sheet,
                { paddingBottom: Math.max(20, insets.bottom) },
              ]}
            >
              <View style={styles.row}>
                <Text style={styles.section}>
                  {panel === "customer"
                    ? "Choose customer"
                    : panel === "payment"
                      ? "Payment & details"
                      : "Scan barcode"}
                </Text>
                {icon(
                  "close",
                  "Close panel",
                  () => setPanel(null),
                  addingCustomer,
                )}
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                {panel === "customer" ? (
                  <>
                    <TextInput
                      accessibilityLabel="Search or add customer"
                      placeholder="Customer name or phone"
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                      style={styles.input}
                      autoFocus
                      editable={!addingCustomer}
                    />
                    {customers
                      .filter((c) =>
                        [c.name, c.phone].some((v) =>
                          v
                            ?.toLowerCase()
                            .includes(customerSearch.trim().toLowerCase()),
                        ),
                      )
                      .map((c) => (
                        <Pressable
                          accessibilityRole="button"
                          key={c.id}
                          disabled={addingCustomer}
                          onPress={() => {
                            setCustomerId(c.id);
                            setPanel(null);
                            setCustomerSearch("");
                          }}
                          style={styles.result}
                        >
                          <Text style={styles.bold}>
                            {c.name}
                            {c.id === customerId ? " ✓" : ""}
                          </Text>
                          {c.phone ? (
                            <Text style={styles.meta}>{c.phone}</Text>
                          ) : null}
                        </Pressable>
                      ))}
                    {customerSearch.trim() &&
                    !customers.some(
                      (c) =>
                        c.name.toLowerCase() ===
                        customerSearch.trim().toLowerCase(),
                    ) ? (
                      <ActionButton
                        title={
                          addingCustomer
                            ? "Adding customer…"
                            : `Add “${customerSearch.trim()}”`
                        }
                        disabled={addingCustomer}
                        onPress={() => void addCustomer()}
                      />
                    ) : null}
                    {error ? (
                      <Text accessibilityRole="alert" style={styles.error}>
                        {error}
                      </Text>
                    ) : null}
                  </>
                ) : panel === "payment" ? (
                  <>
                    <TransactionFinanceFields
                      kind="sale"
                      total={totals.total}
                      subtotal={totals.subtotal}
                      tax={totals.tax}
                      mode={mode}
                      onMode={setMode}
                      paid={paid}
                      onPaid={setPaid}
                      dueDate={dueDate}
                      onDueDate={setDueDate}
                      method={method}
                      onMethod={(value) =>
                        setMethod(value as CreateSaleInput["paymentMethod"])
                      }
                    />
                    <ActionButton title="Done" onPress={() => setPanel(null)} />
                  </>
                ) : panel === "scanner" ? (
                  permission?.granted ? (
                    <>
                      <CameraView
                        style={{ height: 300 }}
                        barcodeScannerSettings={{
                          barcodeTypes: [
                            "ean13",
                            "ean8",
                            "code128",
                            "code39",
                            "upc_a",
                            "upc_e",
                            "qr",
                          ],
                        }}
                        onBarcodeScanned={({ data }) => {
                          if (scanned.current) return;
                          scanned.current = true;
                          const p = products.find(
                            (product) =>
                              product.barcode === data || product.sku === data,
                          );
                          setPanel(null);
                          if (p) add(p);
                          else {
                            setSearch(data);
                            setError(
                              "No product matched that barcode. Search by name or SKU.",
                            );
                          }
                        }}
                      />
                      <Text style={styles.meta}>
                        Point the camera at a product barcode.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.meta}>
                        Allow camera access to scan, or close this panel and
                        enter the barcode in search.
                      </Text>
                      <ActionButton
                        title="Allow camera"
                        onPress={() => {
                          void requestPermission().catch(() =>
                            setError(
                              "Camera access unavailable. Enter the barcode in search.",
                            ),
                          );
                        }}
                      />
                    </>
                  )
                ) : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <ConfirmationDialog
          visible={!!leaveAction}
          title={
            outcome === "unknown"
              ? "Bill status is unconfirmed"
              : "Leave this bill?"
          }
          message={
            outcome === "unknown"
              ? "Check Sales history before creating another bill. This bill may already have been saved."
              : "Your unsaved bill will be discarded."
          }
          confirmLabel="Leave bill"
          cancelLabel="Keep editing"
          onCancel={() => setLeaveAction(null)}
          onConfirm={() => {
            if (leaveAction) {
              const action = leaveAction;
              setLeaveAction(null);
              navigation.dispatch(action);
            }
          }}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  itemRow: { alignItems: "flex-start" },
  itemRowCompact: { flexWrap: "wrap" },
  itemDetails: { flex: 1, minWidth: 0, gap: 8 },
  itemDetailsCompact: { flexBasis: "100%", flexGrow: 0, flexShrink: 0 },
  itemControls: { flex: 1.2, minWidth: 0, gap: 10 },
  header: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#24332A" },
  content: {
    padding: 20,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DEE5E1",
    borderRadius: 15,
    padding: 12,
    gap: 10,
  },
  meta: { color: "#737B77", fontSize: 12, lineHeight: 18, flexShrink: 1 },
  body: { color: "#24332A", fontSize: 14, flexShrink: 1 },
  bold: { color: "#24332A", fontSize: 14, fontWeight: "700", flexShrink: 1 },
  green: { color: "#176B50", fontSize: 12, fontWeight: "700" },
  section: { color: "#24332A", fontSize: 16, fontWeight: "700" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#DEE5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingLeft: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    color: "#24332A",
    fontSize: 13,
  },
  customer: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  icon: {
    width: 44,
    minHeight: 44,
    flexShrink: 0,
    borderRadius: 9,
    backgroundColor: "#F2F5F3",
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    backgroundColor: "#E7F2ED",
    color: "#176B50",
    borderRadius: 7,
    paddingHorizontal: 8,
    minHeight: 44,
    minWidth: 48,
    maxWidth: 90,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  quantity: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: "#DEE5E1",
    borderRadius: 8,
    textAlign: "center",
    color: "#24332A",
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#DEE5E1",
    padding: 16,
    gap: 12,
    width: "100%",
  },
  summary: {
    padding: 12,
    backgroundColor: "#F3F5F4",
    borderWidth: 1,
    borderColor: "#DEE5E1",
    borderRadius: 13,
    gap: 6,
  },
  total: {
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderColor: "#DEE5E1",
    marginTop: 3,
    paddingTop: 8,
  },
  amount: { color: "#176B50", fontSize: 26, fontWeight: "800", flexShrink: 1 },
  error: { color: "#A74737", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.4 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20,31,25,0.4)",
  },
  sheet: {
    maxHeight: "85%",
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DEE5E1",
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    color: "#24332A",
  },
  result: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#E7ECE9",
    gap: 8,
  },
  option: { padding: 10, backgroundColor: "#F3F5F4", borderRadius: 8 },
});
