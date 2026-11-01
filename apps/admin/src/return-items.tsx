import { useEffect, useState } from "react";
import { api } from "./api";
import { type Row } from "./components";
import {
  billPaymentMethod,
  canReturnBill,
  money,
  noteName,
  noteSettlement,
  returnableLines,
  returnPreview,
  type Bill,
  type ReturnKind,
} from "./bill-returns";

const methods = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

/** The bill's credit or debit notes, shown in its edit panel. */
export function BillNotes({ kind, bill }: { kind: ReturnKind; bill: Row }) {
  const notes = (bill as Bill).returns ?? [];
  if (!notes.length) return null;
  return (
    <section className="panel">
      <h3>{noteName(kind)}s</h3>
      <ul className="note-list">
        {notes.map((note) => (
          <li key={note.id}>
            <strong>{note.documentNumber}</strong>
            {note.total != null && ` · ${money(note.total)}`}
            {noteSettlement(kind, note) && <span className="muted"> · {noteSettlement(kind, note)}</span>}
            {note.reason && <span className="muted"> · {note.reason}</span>}
          </li>
        ))}
      </ul>
      {(bill as Bill).netTotal != null && <p className="muted">Net amount after returns: {money((bill as Bill).netTotal)}</p>}
    </section>
  );
}

/**
 * Returns some or all of a completed bill's items as a credit note (sale) or
 * debit note (purchase). It loads the server's copy first, previews the note's
 * value and how it is settled with the shared arithmetic, and sends one
 * requestId per form so a retried click records the return once.
 */
export function ReturnItems({ shopId, kind, bill, done }: { shopId: string; kind: ReturnKind; bill: Row; done: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Bill | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(billPaymentMethod(bill as Bill));
  const [requestId] = useState(() => `web_${crypto.randomUUID()}`);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/${kind === "sale" ? "sales" : "purchases"}/${encodeURIComponent(String(bill.id))}`;
  useEffect(() => {
    if (!open) return;
    let current = true;
    api<Bill>(path, { headers: { "X-Business-Id": shopId } })
      .then((loaded) => {
        if (!current) return;
        setFresh(loaded);
        setMethod(billPaymentMethod(loaded));
      })
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [open, path, shopId]);
  if (!canReturnBill(kind, bill as Bill, true)) return null;
  if (!open)
    return (
      <div className="actions">
        <button type="button" onClick={() => setOpen(true)}>
          Return items…
        </button>
      </div>
    );
  const note = noteName(kind).toLowerCase();
  const lines = fresh ? returnableLines(kind, fresh) : [];
  const preview = fresh ? returnPreview(kind, fresh, typed) : null;
  const typedAny = Object.values(typed).some((value) => value.trim());
  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!fresh || !preview) return;
        if (preview.error) return setError(preview.error);
        setBusy(true);
        setError("");
        try {
          const saved = await api<Bill>(`${path}/returns`, {
            method: "POST",
            headers: { "X-Business-Id": shopId },
            body: JSON.stringify({
              requestId,
              items: preview.items,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
              ...(Number(preview.refund ?? 0) > 0 ? { refundMethod: method } : {}),
            }),
          });
          const issued = saved.returns?.at(-1)?.documentNumber;
          done(`${[noteName(kind), issued].filter(Boolean).join(" ")} recorded for ${String(bill.documentNumber ?? kind)}.`);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Return items from {String(bill.documentNumber ?? kind)}</h3>
      <p className="muted">
        {kind === "sale" ? "Returned items go back into stock" : "Returned items are taken out of stock"} and a {note} is issued. The bill itself does not change.
      </p>
      {!fresh && !error && <p className="muted">Loading the bill…</p>}
      {fresh && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>{kind === "sale" ? "Sold" : "Bought"}</th>
                <th>Returned</th>
                <th>Return now</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const row = preview?.lines.find((entry) => entry.id === line.id);
                const done = Number(line.left) <= 0;
                return (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>
                      {line.sold} {line.unit}
                    </td>
                    <td>{line.returned}</td>
                    <td>
                      {done ? (
                        <span className="muted">Returned in full</span>
                      ) : (
                        <span className="return-quantity">
                          <input
                            aria-label={`Return quantity for ${line.name}`}
                            inputMode="decimal"
                            placeholder={`up to ${line.left}`}
                            value={typed[line.id] ?? ""}
                            onChange={(e) => setTyped({ ...typed, [line.id]: e.target.value })}
                          />
                          <button type="button" onClick={() => setTyped({ ...typed, [line.id]: line.left })}>
                            All {line.left}
                          </button>
                        </span>
                      )}
                      {row?.error && <span className="error"> {row.error}</span>}
                    </td>
                    <td>{row?.total != null ? money(row.total) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="shop-fields">
        <label>
          Reason (optional)
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
        {preview && Number(preview.refund ?? 0) > 0 && (
          <label>
            {kind === "sale" ? "Refund" : "Refund received"} {money(preview.refund)} by
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
      {preview && !preview.error && preview.total != null && (
        <p role="status" className="return-summary">
          {noteName(kind)} value <strong>{money(preview.total)}</strong>
          {Number(preview.balanceReduction) > 0 && ` · ${money(preview.balanceReduction)} off the ${kind === "sale" ? "amount due" : "amount owed"}`}
          {Number(preview.refund) > 0 && ` · ${money(preview.refund)} ${kind === "sale" ? "refunded" : "refund received"}`}
        </p>
      )}
      {/* A quantity error shows on its line; this is for everything else. */}
      {(error || (typedAny && preview?.error && !preview.lines.some((line) => line.error))) && (
        <p role="alert" className="error">
          {error || preview?.error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy || !fresh || !!preview?.error}>
          {busy ? "Recording…" : `Issue ${note}`}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}
