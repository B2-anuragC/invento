import { useState } from "react";
import { api } from "./api";
import { type Row } from "./components";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
const methods = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

/**
 * Cancels a completed sale or purchase: the API reverses its stock and records
 * a refund of anything paid. Two steps, so a stray click never cancels a bill.
 */
export function CancelBill({ shopId, kind, bill, done }: { shopId: string; kind: "sale" | "purchase"; bill: Row; done: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const paid = Number(bill.amountPaid ?? 0);
  const lastMethod = [...((bill.payments as { method?: string; kind?: string }[] | undefined) ?? [])].reverse().find((payment) => payment.kind === "PAYMENT")?.method;
  const [method, setMethod] = useState(lastMethod ?? String(bill.paymentMethod ?? "CASH"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <div className="actions">
        <button type="button" className="danger" onClick={() => setOpen(true)}>
          Cancel this {kind}…
        </button>
      </div>
    );
  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim()) return setError("Enter why this bill is cancelled.");
        setBusy(true);
        setError("");
        try {
          await api(`/${kind === "sale" ? "sales" : "purchases"}/${encodeURIComponent(String(bill.id))}/cancel`, {
            method: "POST",
            headers: { "X-Business-Id": shopId },
            body: JSON.stringify({ reason: reason.trim(), ...(paid > 0 ? { refundMethod: method } : {}) }),
          });
          done();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Cancel {kind} {String(bill.documentNumber ?? "")}</h3>
      <p className="muted">
        {kind === "sale" ? "Its items go back into stock." : "Its items are taken out of stock again."} The bill stays in history as Cancelled and keeps its number. This cannot be undone.
      </p>
      <div className="shop-fields">
        <label>
          Reason
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
        {paid > 0 && (
          <label>
            Refund {money(paid)} by
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="danger" disabled={busy}>
          {busy ? "Cancelling…" : `Confirm cancel`}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Keep {kind}
        </button>
      </div>
    </form>
  );
}
