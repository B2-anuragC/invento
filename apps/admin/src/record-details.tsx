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
  partySummary,
  type BillKind,
  type DetailBill,
  type DetailLine,
  type PartyBalance,
} from "./bill-details";

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

/** The whole bill, read-only: who, when, items, amounts, balance and payments. */
export function BillView({ shopId, kind, id, close }: { shopId: string; kind: BillKind; id: string; close: () => void }) {
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
