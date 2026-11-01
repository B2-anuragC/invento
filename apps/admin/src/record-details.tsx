import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Notice, type Row } from "./components";
import { formatCell } from "./format";
import {
  billAmounts,
  billDate,
  billFacts,
  billItems,
  billPayments,
  balanceText,
  methodName,
  partySummary,
  type BillKind,
  type DetailBill,
  type DetailLine,
  type PartyBalance,
} from "./bill-details";
import { canRecordPayment, PAYMENT_METHODS, paymentRecordedMessage, paymentRequest, paymentStart } from "./record-payment";

function Facts({ lines }: { lines: DetailLine[] }) {
  return (
    <dl className="detail-list">
      {lines.map((line) => (
        <div key={line.label}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A details panel that scrolls into view when opened and has a Close button. */
function DetailsPanel({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    panel.current?.focus();
  }, []);
  return (
    <section className="panel record-details" ref={panel} tabIndex={-1} aria-label={title}>
      <div className="record-details-heading">
        <h2>{title}</h2>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
      {children}
    </section>
  );
}

/**
 * Records money received from the customer or paid to the supplier. One
 * requestId per set of values, so a retried click records the payment once;
 * changing the amount, method or date makes it a new request.
 */
function RecordPayment({ shopId, kind, bill, paid }: { shopId: string; kind: BillKind; bill: DetailBill; paid: (message: string) => void }) {
  const start = paymentStart(kind, bill);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(start.amount);
  const [opening, setOpening] = useState("");
  const [method, setMethod] = useState(start.method);
  const [paidOn, setPaidOn] = useState(start.paidOn);
  const [request, setRequest] = useState({ values: "", id: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <div className="actions">
        <button type="button" className="primary" onClick={() => setOpen(true)}>
          Record payment…
        </button>
      </div>
    );
  const historical = bill.amountPaid == null;
  const decimal = (value: string) => /^\d{0,12}(?:\.\d{0,2})?$/.test(value);
  return (
    <form
      className="panel record-payment"
      onSubmit={async (event) => {
        event.preventDefault();
        const values = JSON.stringify([amount.trim(), opening.trim(), method, paidOn]);
        const requestId = request.values === values && request.id ? request.id : `web_${crypto.randomUUID()}`;
        setRequest({ values, id: requestId });
        const checked = paymentRequest(kind, bill, { amount, opening, method, paidOn }, requestId);
        if ("error" in checked) return setError(checked.error);
        setBusy(true);
        setError("");
        try {
          await api(`/${kind === "sale" ? "sales" : "purchases"}/${encodeURIComponent(bill.id)}/payments`, {
            method: "POST",
            headers: { "X-Business-Id": shopId },
            body: JSON.stringify(checked.body),
          });
          paid(paymentRecordedMessage(kind, bill, checked.amount));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{kind === "sale" ? "Record a payment from the customer" : "Record a payment to the supplier"}</h3>
      <p className="muted">
        {historical
          ? "Payments on this older bill were not recorded. Enter what was paid before this payment, including 0 if nothing."
          : `Still owed: ${formatCell("amount", (start.balance ?? 0) / 100)}. This records money already ${kind === "sale" ? "received" : "paid"}; it does not move money.`}
      </p>
      <div className="shop-fields">
        {historical && (
          <label>
            Paid before this payment (₹)
            <input inputMode="decimal" value={opening} disabled={busy} onChange={(e) => decimal(e.target.value) && setOpening(e.target.value)} />
          </label>
        )}
        <label>
          Amount (₹)
          <input inputMode="decimal" value={amount} disabled={busy} onChange={(e) => decimal(e.target.value) && setAmount(e.target.value)} />
        </label>
        <label>
          {kind === "sale" ? "Received on" : "Paid on"}
          <input type="date" value={paidOn} min={start.minDay} max={start.maxDay} disabled={busy} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label>
          Method
          <select value={method} disabled={busy} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {methodName(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Recording…" : "Record payment"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The whole bill, read-only: who, when, items, amounts, balance and payments.
 * Members who record payments can add one here while money is still owed.
 */
export function BillView({
  shopId,
  kind,
  id,
  close,
  paid,
}: {
  shopId: string;
  kind: BillKind;
  id: string;
  close: () => void;
  /** Set when the member may record payments; called after one is saved. */
  paid?: (message: string) => void;
}) {
  const [state, setState] = useState<{ data?: DetailBill; error?: string; loading: boolean }>({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ loading: true });
    api<DetailBill>(`/${kind === "sale" ? "sales" : "purchases"}/${encodeURIComponent(id)}`, {
      headers: { "X-Business-Id": shopId },
    })
      .then((data) => current && setState({ data, loading: false }))
      .catch((error) => current && setState({ error: (error as Error).message, loading: false }));
    return () => {
      current = false;
    };
  }, [shopId, kind, id, retry]);
  const bill = state.data;
  const items = bill ? billItems(kind, bill) : [];
  const payments = bill ? billPayments(bill) : [];
  return (
    <DetailsPanel
      title={bill?.documentNumber ? `${kind === "sale" ? "Sale" : "Purchase"} ${bill.documentNumber}` : `${kind === "sale" ? "Sale" : "Purchase"} details`}
      close={close}
    >
      <Notice {...state} retry={() => setRetry((v) => v + 1)} />
      {bill && (
        <>
          <Facts lines={billFacts(kind, bill)} />
          <h3>Items</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>{kind === "sale" ? "Price" : "Cost price"}</th>
                  <th>GST</th>
                  <th>Amount</th>
                  <th>Returned</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.price}</td>
                    <td>{item.gst}</td>
                    <td>{item.amount}</td>
                    <td>{item.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Amounts</h3>
          <Facts lines={billAmounts(bill)} />
          {paid && canRecordPayment(bill) && (
            <RecordPayment
              key={`${bill.amountPaid ?? "unknown"}-${payments.length}`}
              shopId={shopId}
              kind={kind}
              bill={bill}
              paid={(message) => {
                setRetry((v) => v + 1);
                paid(message);
              }}
            />
          )}
          {payments.length > 0 && (
            <>
              <h3>Payments</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Method</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.date}</td>
                        <td>{payment.kind}</td>
                        <td>{payment.method}</td>
                        <td>{payment.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </DetailsPanel>
  );
}

const contactKeys: [string, string][] = [
  ["contactName", "Contact name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["address", "Address"],
  ["gstin", "GSTIN"],
];

/** A customer's or supplier's contact details and their bills with what is still owed. */
export function PartyView({
  kind,
  party,
  bills,
  balance,
  close,
}: {
  kind: BillKind;
  party: Row;
  /** Undefined when the member cannot see the bills. */
  bills?: DetailBill[];
  balance?: PartyBalance;
  close: () => void;
}) {
  const facts: DetailLine[] = contactKeys
    .filter(([key]) => party[key] != null && party[key] !== "")
    .map(([key, title]) => ({ label: title, value: String(party[key]) }));
  facts.push({ label: "Status", value: party.status === "INACTIVE" ? "Inactive" : "Active" });
  return (
    <DetailsPanel title={String(party.name ?? (kind === "sale" ? "Customer" : "Supplier"))} close={close}>
      <Facts lines={facts} />
      {bills && (
        <>
          <h3>{kind === "sale" ? "Sales" : "Purchases"}</h3>
          <p className="muted">{partySummary(kind, balance)}</p>
          {bills.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{kind === "sale" ? "Invoice no." : "Purchase no."}</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>{bill.documentNumber ?? "—"}</td>
                      <td>{formatCell("saleDate", billDate(kind, bill))}</td>
                      <td>{formatCell("total", bill.total)}</td>
                      <td>{balanceText(bill)}</td>
                      <td>{formatCell("status", bill.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DetailsPanel>
  );
}
