import { useEffect, useState } from "react";
import { api } from "./api";
import { type Row } from "./components";
import { billPaymentMethod, money, type Bill } from "./bill-returns";
import { chargeGstSwitch } from "./sale-model";
import {
  addEditLine,
  billEditInput,
  billEditPreview,
  canEditBill,
  editedSummary,
  editFormFromBill,
  editLineKey,
  linePrice,
  productFromLines,
  productMatches,
  type EditableBill,
  type EditForm,
  type EditKind,
  type EditLine,
  type EditProduct,
} from "./bill-edit";

const methods = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];
const unitText = (unit: string | undefined) => (unit ?? "PIECE").replaceAll("_", " ").toLowerCase();
type Loaded = EditableBill & Bill & { supplier?: { categories?: string[]; productIds?: string[] } | null; items: (NonNullable<EditableBill["items"]>[number] & { optionName?: string | null; gstRate?: string | null; product?: { name?: string; unit?: string } | null })[] };

/** When, and why, the bill's items were last edited; shown in its edit panel. */
export function BillEdited({ bill }: { bill: Row }) {
  const edited = editedSummary(bill as { editedAt?: string; editReason?: string | null });
  if (!edited) return null;
  return (
    <p className="panel muted" role="note">
      <strong>{edited.title}</strong>
      {edited.reason && ` · ${edited.reason}`}
    </p>
  );
}

/**
 * Changes the items, quantities, prices, discount (sales) and GST choice of a
 * completed bill, with a reason (owners and admins). It loads the server's copy
 * first, previews the new total and any refund with the arithmetic the API
 * uses, and sends one requestId per form plus the revision and expected total,
 * so a retried click edits once and a bill changed meanwhile is refused.
 */
export function EditBillItems({ shopId, kind, bill, done }: { shopId: string; kind: EditKind; bill: Row; done: (message: string) => void }) {
  const sale = kind === "sale";
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Loaded | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [products, setProducts] = useState<Record<string, EditProduct>>({});
  const [catalog, setCatalog] = useState<EditProduct[]>([]);
  const [shop, setShop] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("CASH");
  const [requestId] = useState(() => `web_${crypto.randomUUID()}`);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/${sale ? "sales" : "purchases"}/${encodeURIComponent(String(bill.id))}`;
  useEffect(() => {
    if (!open) return;
    let current = true;
    const headers = { "X-Business-Id": shopId };
    (async () => {
      const [loaded, list, shopData] = await Promise.all([
        api<Loaded>(path, { headers }),
        api<EditProduct[]>("/products", { headers }),
        sale ? api<Row>(`/businesses/${encodeURIComponent(shopId)}`, { headers }).catch(() => null) : Promise.resolve(null),
      ]);
      const byId: Record<string, EditProduct> = Object.fromEntries(list.map((product) => [product.id, product]));
      // Products the shop stopped selling can stay on the bill.
      for (const productId of new Set(loaded.items.map((item) => item.productId))) {
        if (byId[productId]) continue;
        byId[productId] = await api<EditProduct>(`/products/${encodeURIComponent(productId)}`, { headers }).catch(() => productFromLines(kind, loaded.items, productId));
      }
      if (!current) return;
      setFresh(loaded);
      setForm(editFormFromBill(kind, loaded));
      setProducts(byId);
      setCatalog(list);
      setShop(shopData);
      setMethod(billPaymentMethod(loaded));
    })().catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [open, path, shopId, kind, sale]);
  if (!canEditBill(bill as EditableBill, true)) return null;
  if (!open)
    return (
      <div className="actions">
        <button type="button" onClick={() => setOpen(true)}>
          Edit items…
        </button>
      </div>
    );
  const number = String(bill.documentNumber ?? kind);
  // A shop without a GSTIN cannot charge GST on a sale, whatever the bill had.
  const gstSwitch = form ? chargeGstSwitch(kind, form.chargeGst, sale ? shop : null) : null;
  const effective = form && gstSwitch ? { ...form, chargeGst: form.chargeGst && !gstSwitch.disabled } : null;
  const preview = fresh && effective ? billEditPreview(kind, fresh, effective, products) : null;
  const refund = Number(preview?.refund ?? 0);
  const due = Number(preview?.balanceDue ?? 0);
  const paid = fresh?.amountPaid == null ? 0 : Number(fresh.amountPaid);
  const matches = form ? productMatches(kind, catalog, search, fresh?.supplier) : [];
  const change = (next: Partial<EditForm>) => {
    setForm((current) => (current ? { ...current, ...next } : current));
    setError("");
  };
  const editLine = (index: number, patch: Partial<EditLine>) => form && change({ lines: form.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const add = (product: EditProduct, optionId?: string) => {
    if (!form) return;
    change({ lines: addEditLine(kind, form.lines, product, optionId) });
    setProducts((current) => ({ ...current, [product.id]: current[product.id] ?? product }));
    setSearch("");
  };
  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!fresh || !effective || !preview || busy) return;
        setTried(true);
        if (preview.error) return setError(preview.error);
        if (!reason.trim()) return setError("Enter why this bill is edited.");
        setBusy(true);
        setError("");
        try {
          await api(`${path}/items`, {
            method: "PUT",
            headers: { "X-Business-Id": shopId },
            body: JSON.stringify(billEditInput(kind, fresh, effective, products, { requestId, reason, refundMethod: method })),
          });
          done(`${number} edited. New total ${money(preview.total)}${refund > 0 ? `; ${money(refund)} ${sale ? "refunded" : "refund received"}` : ""}.`);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Edit items of {number}</h3>
      <p className="muted">
        Change the items, quantities, prices{sale ? ", discount" : ""} or GST. Stock is corrected by the difference. The {kind} keeps its number, date, {sale ? "customer" : "supplier"} and payments.
      </p>
      {!form && !error && <p className="muted">Loading the bill…</p>}
      {form &&
        form.lines.map((line, index) => {
          const product = products[line.productId];
          const option = line.optionId ? product?.sellingOptions?.find((entry) => entry.id === line.optionId) : undefined;
          const lineError = preview?.lineErrors[editLineKey(line)];
          const amount = Number(line.quantity || 0) * Number(linePrice(line, product) || 0);
          const name = product?.name ?? "Item";
          return (
            <div className="sale-line" key={editLineKey(line)}>
              <div>
                <strong>{name}</strong>
                <small>
                  {option ? option.name : unitText(line.unit ?? product?.unit)}
                  {product?.status && product.status !== "ACTIVE" ? " · no longer sold; can stay on this bill" : ""}
                </small>
                <small>{money(Number.isFinite(amount) ? amount : 0)}</small>
                {lineError && (tried || line.quantity !== "") && <small className="error">{lineError}</small>}
              </div>
              <label>
                Quantity
                <input
                  aria-label={`Quantity for ${name}`}
                  inputMode="decimal"
                  value={line.quantity}
                  disabled={busy}
                  onChange={(e) => /^\d{0,9}(?:\.\d{0,3})?$/.test(e.target.value) && editLine(index, { quantity: e.target.value })}
                />
              </label>
              <label>
                {sale ? "Price" : "Cost price"} per {option ? "option" : unitText(line.unit ?? product?.unit)} (₹)
                {option ? (
                  <input aria-label={`Price for ${name}`} value={linePrice(line, product)} readOnly disabled title="Selling options are charged at their current price." />
                ) : (
                  <input
                    aria-label={`Price for ${name}`}
                    inputMode="decimal"
                    value={line.price}
                    disabled={busy}
                    onChange={(e) => /^\d{0,10}(?:\.\d{0,2})?$/.test(e.target.value) && editLine(index, { price: e.target.value })}
                  />
                )}
              </label>
              <button type="button" className="danger" aria-label={`Remove ${name}`} disabled={busy} onClick={() => change({ lines: form.lines.filter((_, i) => i !== index) })}>
                Remove
              </button>
            </div>
          );
        })}
      {form && (
        <>
          <label>
            Add an item
            <input type="search" placeholder="Search by name, SKU or barcode…" value={search} disabled={busy} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {search.trim() && !matches.length && <p className="muted">{sale ? "No active product matches." : "No matching product for this supplier."}</p>}
          {matches.length > 0 && (
            <div className="sale-choices">
              {matches.map((product) =>
                [undefined, ...(sale ? (product.sellingOptions ?? []) : [])].map((option) => (
                  <button type="button" key={`${product.id}-${option?.id ?? ""}`} disabled={busy} onClick={() => add(product, option?.id)}>
                    <strong>{product.name}</strong>
                    <small>
                      {option
                        ? `${option.name} · ${money(option.sellingPrice)}`
                        : `${product.sku ?? ""} · ${sale ? money(product.sellingPrice) : product.purchasePrice == null ? "no cost price" : money(product.purchasePrice)} / ${unitText(product.unit)}`}
                    </small>
                    <span>+ Add</span>
                  </button>
                )),
              )}
            </div>
          )}
          <label className="checkbox charge-gst">
            <input type="checkbox" checked={!!effective?.chargeGst} disabled={busy || gstSwitch?.disabled} aria-describedby="edit-gst-note" onChange={(e) => change({ chargeGst: e.target.checked })} />
            <span>
              <strong>{sale ? "Charge GST" : "Supplier charged GST"}</strong>
              <small id="edit-gst-note">{gstSwitch?.note}</small>
            </span>
          </label>
          <div className="shop-fields">
            {sale && (
              <label>
                Discount (before GST)
                <span className="edit-discount">
                  <select aria-label="Discount type" value={form.discountMode} disabled={busy} onChange={(e) => change({ discountMode: e.target.value as "amount" | "percent", discountValue: "" })}>
                    <option value="amount">Amount (₹)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <input aria-label="Discount" inputMode="decimal" value={form.discountValue} disabled={busy} onChange={(e) => /^\d{0,12}(?:\.\d{0,2})?$/.test(e.target.value) && change({ discountValue: e.target.value })} />
                </span>
                {preview?.discountError && <small className="error">{preview.discountError}</small>}
              </label>
            )}
            {refund > 0 && (
              <label>
                {sale ? "Refund" : "Refund received"} {money(refund)} by
                <select value={method} disabled={busy} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Reason for the edit
              <input value={reason} maxLength={200} disabled={busy} placeholder={sale ? "e.g. Customer took one less" : "e.g. Supplier bill corrected"} aria-invalid={tried && !reason.trim()} onChange={(e) => { setReason(e.target.value); setError(""); }} />
            </label>
          </div>
          {preview && (
            <div role="status" className="return-summary">
              <p className="muted">
                Subtotal {money(preview.subtotal)}
                {preview.discount > 0 && ` · Discount ${money(preview.discount)}`} · GST {money(preview.tax)}
              </p>
              <p>
                Total before {money(fresh?.total)} → <strong>New total {money(preview.total)}</strong>
              </p>
              <p className="muted">
                {refund > 0
                  ? sale
                    ? `${money(refund)} was paid above the new total and is refunded to the customer.`
                    : `${money(refund)} was paid above the new total; the supplier refunds it.`
                  : due > 0
                    ? paid > 0
                      ? `${money(paid)} was paid; ${money(due)} will be ${sale ? "left to collect" : "left to pay"}.`
                      : `${money(due)} ${sale ? "to collect" : "to pay"}.`
                    : "Stays fully paid."}
              </p>
            </div>
          )}
        </>
      )}
      {(error || (tried && preview?.error)) && (
        <p role="alert" className="error">
          {error || preview?.error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy || !form}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Close without saving
        </button>
      </div>
    </form>
  );
}
