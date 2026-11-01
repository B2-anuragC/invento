import { useRef, useState } from "react";
import { chargeGstError, WALK_IN_PAYMENT_MESSAGE } from "@invento/shared";
import { api } from "./api";
import { type Row } from "./components";
import {
  chargeGstSwitch,
  saleTotals,
  paymentAmount,
  type SaleLine,
  type SaleProduct,
} from "./sale-model";
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );
export function SaleCreator({
  id,
  products,
  customers,
  shop,
  saved,
}: {
  id: string;
  products: SaleProduct[];
  customers: Row[];
  shop: Row;
  saved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [savedNumber, setSavedNumber] = useState("");
  const [review, setReview] = useState(false);
  const [customer, setCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [mode, setMode] = useState("full");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("CASH");
  const [dueDate, setDueDate] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  // Off by default on every new sale; only a shop with a GSTIN can turn it on.
  const [chargeGstOn, setChargeGstOn] = useState(false);
  const gstSwitch = chargeGstSwitch("sale", chargeGstOn, shop);
  const chargeGst = chargeGstOn && !gstSwitch.disabled;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  // An unfinished "10." counts as 10 while it is typed.
  const discountText = discountValue.replace(/\.$/, "");
  const discount = discountText
    ? discountMode === "percent"
      ? { discountPercent: discountText }
      : { discountAmount: discountText }
    : {};
  let totals = { subtotal: 0, discount: 0, tax: 0, total: 0 },
    validation = "";
  try {
    totals = saleTotals(lines, discount, chargeGst);
    validation = chargeGstError({
      chargeGst,
      sellerGstin: shop.gstin ? String(shop.gstin) : null,
    });
  } catch (e) {
    validation = (e as Error).message;
  }
  const selectedCustomer = customers.find((c) => c.id === customer);
  // Credit needs a named customer to collect from.
  if (selectedCustomer?.isWalkIn && mode !== "full")
    validation ||= WALK_IN_PAYMENT_MESSAGE;
  const updateLine = (index: number, patch: Partial<SaleLine>) => {
    setError("");
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!review) {
      if (customer && lines.length && !validation) setReview(true);
      else
        setError(validation || "Choose a customer and at least one product.");
      return;
    }
    try {
      if (!customer || !lines.length || validation)
        throw new Error(
          validation || "Choose a customer and at least one product.",
        );
      const values = new FormData(event.currentTarget);
      const body =
        pending ??
        JSON.stringify({
          requestId: `web_${crypto.randomUUID()}`,
          customerId: customer,
          saleDate: new Date().toISOString(),
          paymentMethod: method,
          expectedTotal: totals.total.toFixed(2),
          amountPaid: paymentAmount(mode, totals.total, paid),
          ...(mode !== "full" && dueDate ? { dueDate } : {}),
          ...discount,
          chargeGst,
          ...(values.get("invoiceNumber")
            ? { invoiceNumber: values.get("invoiceNumber") }
            : {}),
          ...(values.get("note") ? { note: values.get("note") } : {}),
          items: lines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            sellingPrice: line.price,
            ...(line.optionId
              ? { sellingOptionId: line.optionId }
              : { unit: line.product.unit }),
          })),
        });
      submitting.current = true;
      setBusy(true);
      setPending(body);
      const sale = await api<{ documentNumber?: string | null }>("/sales", {
        method: "POST",
        headers: { "X-Business-Id": id },
        body,
      });
      setSavedNumber(sale?.documentNumber ?? "");
      setPending(null);
      setLines([]);
      setCustomer("");
      setReview(false);
      setOpen(false);
      setMode("full");
      setPaid("");
      setDueDate("");
      setDiscountMode("amount");
      setDiscountValue("");
      setChargeGstOn(false);
      setMethod("CASH");
      setSearch("");
      setCustomerSearch("");
      form.current?.reset();
      saved();
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408)
        setPending(null);
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="sale-create">
      <div className="section-heading">
        <div>
          <h2>Sales</h2>
          <p>Create a bill in a few simple steps.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setSavedNumber("");
            setOpen(!open);
          }}
          disabled={busy || !!pending}
        >
          {open ? "Close new sale" : "+ New sale"}
        </button>
      </div>
      {savedNumber && (
        <p className="notice" role="status">
          Sale saved · Invoice {savedNumber}
        </p>
      )}
      {open && (
        <form ref={form} className="panel sale-composer" onSubmit={submit}>
          <div className="sale-steps">
            <span className={!review ? "current" : ""}>
              1 · Customer & products
            </span>
            <span className={review ? "current" : ""}>
              2 · Review & payment
            </span>
          </div>
          <fieldset disabled={busy || !!pending}>
            {!review ? (
              <>
                <div className="sale-customer">
                  <h3>Who is this sale for?</h3>
                  <label>
                    Find customer
                    <input
                      type="search"
                      placeholder="Search name or phone…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </label>
                  <div className="sale-choices">
                    {customers
                      .filter(
                        (c) =>
                          c.id === customer ||
                          `${c.name} ${c.phone ?? ""}`
                            .toLowerCase()
                            .includes(customerSearch.toLowerCase()),
                      )
                      .map((c) => (
                        <button
                          type="button"
                          key={String(c.id)}
                          aria-pressed={customer === c.id}
                          onClick={() => {
                            setCustomer(String(c.id));
                            setCustomerSearch("");
                            setError("");
                          }}
                        >
                          <strong>{String(c.name)}</strong>
                          <small>
                            {String(c.phone ?? c.email ?? "Customer")}
                          </small>
                          {customer === c.id && <span>Selected ✓</span>}
                        </button>
                      ))}
                    {!customers.length && (
                      <p className="muted">
                        Add a customer from Customers to start a sale.
                      </p>
                    )}
                  </div>
                </div>
                <div className="sale-products">
                  <h3>Add products</h3>
                  <label>
                    Find a product
                    <input
                      type="search"
                      placeholder="Search by name, SKU or barcode…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="sale-choices">
                    {products
                      .filter((p) =>
                        `${p.name} ${p.sku ?? ""} ${(p as SaleProduct & { barcode?: string }).barcode ?? ""}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .slice(0, 12)
                      .map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          disabled={lines.some((l) => l.product.id === p.id)}
                          onClick={() => {
                            setLines([
                              ...lines,
                              {
                                product: p,
                                quantity: "1",
                                price: String(p.sellingPrice),
                              },
                            ]);
                            setSearch("");
                            setError("");
                          }}
                        >
                          <strong>{p.name}</strong>
                          <small>
                            {p.sku} · {money(Number(p.sellingPrice))} /{" "}
                            {p.unit?.replaceAll("_", " ").toLowerCase()}
                          </small>
                          <span>
                            {lines.some((l) => l.product.id === p.id)
                              ? "Added ✓"
                              : "+ Add"}
                          </span>
                        </button>
                      ))}
                  </div>
                  {!products.length && (
                    <p className="muted">
                      Add a product from Products to start a sale.
                    </p>
                  )}
                </div>
                <h3>
                  Your bill · {lines.length}{" "}
                  {lines.length === 1 ? "item" : "items"}
                </h3>
                {!lines.length && (
                  <p className="notice">
                    Choose products above. Prices fill in automatically.
                  </p>
                )}
                {lines.map((line, index) => (
                  <div className="sale-line" key={line.product.id}>
                    <div>
                      <strong>{line.product.name}</strong>
                      <small>
                        {line.product.unit?.replaceAll("_", " ").toLowerCase()}
                      </small>
                      {!!line.product.sellingOptions?.length && (
                        <label>
                          Selling option
                          <select
                            value={line.optionId ?? ""}
                            onChange={(e) => {
                              const option = line.product.sellingOptions?.find(
                                (o) => o.id === e.target.value,
                              );
                              updateLine(index, {
                                optionId: option?.id,
                                price: String(
                                  option?.sellingPrice ??
                                    line.product.sellingPrice,
                                ),
                              });
                            }}
                          >
                            <option value="">Standard price</option>
                            {line.product.sellingOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <label>
                      Quantity
                      <input
                        aria-label={`Quantity for ${line.product.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Unit price (₹)
                      <input
                        aria-label={`Price for ${line.product.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={line.price}
                        onChange={(e) =>
                          updateLine(index, { price: e.target.value })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="danger"
                      aria-label={`Remove ${line.product.name}`}
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <h3>{String(selectedCustomer?.name)}</h3>
                    <small>Customer</small>
                  </div>
                  <button type="button" onClick={() => setReview(false)}>
                    Edit customer or items
                  </button>
                </div>
                {lines.map((line) => (
                  <div className="transaction-line" key={line.product.id}>
                    <strong>{line.product.name}</strong>
                    <span>
                      {line.quantity} × {money(Number(line.price))}
                    </span>
                  </div>
                ))}
                <label className="checkbox charge-gst">
                  <input
                    type="checkbox"
                    checked={chargeGst}
                    disabled={gstSwitch.disabled}
                    aria-describedby="charge-gst-note"
                    onChange={(e) => setChargeGstOn(e.target.checked)}
                  />
                  <span>
                    <strong>Charge GST</strong>
                    <small id="charge-gst-note">{gstSwitch.note}</small>
                  </span>
                </label>
                <div className="shop-fields">
                  <label>
                    Discount (before GST)
                    <select
                      aria-label="Discount type"
                      value={discountMode}
                      onChange={(e) => {
                        setDiscountMode(e.target.value as "amount" | "percent");
                        setDiscountValue("");
                      }}
                    >
                      <option value="amount">Amount (₹)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                  </label>
                  <label>
                    {discountMode === "percent" ? "Discount (%)" : "Discount (₹)"}
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={discountValue}
                      onChange={(e) => {
                        if (/^\d{0,12}(?:\.\d{0,2})?$/.test(e.target.value))
                          setDiscountValue(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <h3 className="payment-title">Payment</h3>
                <div
                  className="payment-options"
                  role="group"
                  aria-label="Payment type"
                >
                  {[
                    ["full", "Paid in full"],
                    ["partial", "Partial payment"],
                    ["credit", "Pay later"],
                  ].map(([key, title]) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={mode === key}
                      onClick={() => setMode(key)}
                    >
                      {title}
                    </button>
                  ))}
                </div>
                <div className="shop-fields">
                  {mode !== "credit" && (
                    <label>
                      Payment method
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                      >
                        {["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"].map(
                          (m) => (
                            <option key={m} value={m}>
                              {m.replaceAll("_", " ")}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                  {mode === "partial" && (
                    <label>
                      Amount received (₹)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                      />
                    </label>
                  )}
                  {mode !== "full" && (
                    <label>
                      Due date (optional)
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <details className="sale-extras">
                  <summary>Reference & note (optional)</summary>
                  <div className="shop-fields">
                    <label>
                      Reference
                      <input name="invoiceNumber" maxLength={80} />
                    </label>
                    <label>
                      Note
                      <input name="note" maxLength={500} />
                    </label>
                  </div>
                </details>
              </>
            )}
          </fieldset>
          {validation && (
            <p role="alert" className="error">
              {validation}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {pending && !busy && (
            <p className="muted">
              The sale could not be confirmed. Retry sends the same bill safely;
              editing is locked to prevent duplicate sales.
            </p>
          )}
          <div className="sale-total">
            <div>
              <small>
                Subtotal {money(totals.subtotal)}
                {totals.discount > 0 && ` · Discount −${money(totals.discount)}`} ·
                GST {money(totals.tax)}
              </small>
              <strong>Total {money(totals.total)}</strong>
              <small>
                The server confirms final prices, tax and stock when saving.
              </small>
            </div>
            {/* Separate keys: reusing one element would turn the Review click into a submit. */}
            {!review ? (
              <button
                key="review"
                type="button"
                className="primary"
                disabled={!customer || !lines.length || !!validation}
                onClick={() => {
                  setError("");
                  setReview(true);
                }}
              >
                Review sale<span aria-hidden> →</span>
              </button>
            ) : (
              <button key="create" className="primary" disabled={busy || !!validation}>
                {busy
                  ? "Creating sale…"
                  : pending
                    ? "Retry original sale"
                    : `Create sale · ${money(totals.total)}`}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
