import { useState } from "react";
import {
  STOCK_ADJUSTMENT_MODES,
  STOCK_ADJUSTMENT_NOTE_MAX,
  planStockAdjustment,
  reasonsForMode,
  stockAdjustmentModeLabels,
  stockAdjustmentReasonLabels,
  type StockAdjustmentMode,
  type StockAdjustmentReason,
} from "@invento/shared";
import { api } from "./api";
import { type Row } from "./components";
import { stockAmount } from "./stock-unit";

const quantityLabels: Record<StockAdjustmentMode, string> = {
  count: "Counted quantity",
  add: "Quantity to add",
  remove: "Quantity to remove",
};

/**
 * Set the counted stock (the difference is recorded), or add or remove stock,
 * with a reason. A count is checked against the latest stock when it is saved.
 */
export function StockAdjustment({ shopId, products, stock, saved }: { shopId: string; products: Row[]; stock: Row[]; saved: (message: string) => void }) {
  const withStock = products.filter((p) => stock.some((s) => s.productId === p.id));
  const [productId, setProductId] = useState(String(withStock[0]?.id ?? ""));
  const [mode, setMode] = useState<StockAdjustmentMode>("count");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<StockAdjustmentReason>("COUNT_CORRECTION");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!withStock.length) return <p className="muted">Record opening stock for a product before adjusting it.</p>;
  const product = withStock.find((p) => p.id === productId) ?? withStock[0];
  const current = stock.find((s) => s.productId === product.id)?.quantity ?? "0";
  const reasons = reasonsForMode(mode);
  const chosenReason = reasons.includes(reason) ? reason : "COUNT_CORRECTION";
  const input = { productId: String(product.id), mode, quantity, reason: chosenReason, note, unit: String(product.unit), piecesPerUnit: product.piecesPerUnit as number | null | undefined };
  const preview = quantity === "" ? null : planStockAdjustment({ ...input, currentStock: String(current) });
  const amount = (value: number | string) => stockAmount(value, product.unit);
  return (
    <form
      className="panel"
      aria-label="Adjust stock"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          // Work the difference out from the latest stock, not the table loaded earlier.
          const live = await api<Row>(`/inventory/${encodeURIComponent(String(product.id))}`, { headers: { "X-Business-Id": shopId } });
          const plan = planStockAdjustment({ ...input, currentStock: String(live.quantity ?? "0") });
          if (!plan.ok) return setError(plan.error);
          await api("/inventory/adjustments", { method: "POST", headers: { "X-Business-Id": shopId }, body: JSON.stringify(plan.request) });
          setQuantity("");
          setNote("");
          saved(`Stock updated: ${String(product.name)} is now ${amount(plan.after)} (${amount(Math.abs(plan.change))} ${plan.change > 0 ? "added" : "removed"}).`);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Adjust stock</h3>
      <div className="shop-fields">
        <label>
          Product
          <select value={String(product.id)} onChange={(e) => { setProductId(e.target.value); setError(""); }}>
            {withStock.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.name)} · {String(p.sku)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select value={mode} onChange={(e) => { setMode(e.target.value as StockAdjustmentMode); setError(""); }}>
            {STOCK_ADJUSTMENT_MODES.map((m) => <option key={m} value={m}>{stockAdjustmentModeLabels[m]}</option>)}
          </select>
        </label>
        <label>
          {quantityLabels[mode]} ({stockAmount(2, product.unit).replace(/^2 /, "")})
          <input inputMode="decimal" required value={quantity} onChange={(e) => { setQuantity(e.target.value.trim()); setError(""); }} />
        </label>
        <label>
          Reason
          <select value={chosenReason} onChange={(e) => { setReason(e.target.value as StockAdjustmentReason); setError(""); }}>
            {reasons.map((r) => <option key={r} value={r}>{stockAdjustmentReasonLabels[r]}</option>)}
          </select>
        </label>
        <label>
          Note{chosenReason === "OTHER" ? "" : " (optional)"}
          <input value={note} maxLength={STOCK_ADJUSTMENT_NOTE_MAX} onChange={(e) => { setNote(e.target.value); setError(""); }} />
        </label>
      </div>
      <p className="muted">
        Current stock: {amount(String(current))}.
        {mode === "count" ? " The difference from the current stock is recorded." : ""}
        {preview?.ok ? ` After saving: ${amount(preview.after)} (${amount(Math.abs(preview.change))} ${preview.change > 0 ? "added" : "removed"}).` : ""}
      </p>
      {(error || (preview && !preview.ok && quantity !== "")) && (
        <p role="alert" className="error">{error || (preview && !preview.ok ? preview.error : "")}</p>
      )}
      <div className="actions">
        <button disabled={busy}>{busy ? "Saving…" : "Save adjustment"}</button>
      </div>
    </form>
  );
}
