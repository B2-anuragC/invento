import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

export type Row = Record<string, unknown>;
export type Page = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};
export type Column = {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
};
export const label = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
export const date = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString(undefined, { timeZone: "UTC" }) +
      " UTC"
    : "Not recorded";
export const status = (active: unknown) => (
  <span className={`badge ${active ? "active" : "inactive"}`}>
    {active ? "Active" : "Restricted"}
  </span>
);
export const display = (value: unknown): React.ReactNode =>
  value == null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export function useLoad<T>(path: string, revision = 0) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ loading: true });
    api<T>(path)
      .then((data) => {
        if (current) setState({ data, loading: false });
      })
      .catch((error) => {
        if (current) setState({ error: error.message, loading: false });
      });
    return () => {
      current = false;
    };
  }, [path, revision, retry]);
  return { ...state, retry: () => setRetry((value) => value + 1) };
}
export function Notice({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
}) {
  return loading ? (
    <p role="status" className="notice">
      Loading data…
    </p>
  ) : error ? (
    <div role="alert" className="error">
      {error} <button onClick={retry}>Try again</button>
    </div>
  ) : null;
}
export function Table({
  path,
  columns,
  searchable = false,
  filterStatus = false,
  revision = 0,
}: {
  path: string;
  columns: Column[];
  searchable?: boolean;
  filterStatus?: boolean;
  revision?: number;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(query ? { search: query } : {}),
    ...(filter ? { status: filter } : {}),
  });
  const result = useLoad<Page>(
    `${path}${path.includes("?") ? "&" : "?"}${params}`,
    revision,
  );
  return (
    <section className="panel">
      <div className="table-tools">
        {searchable && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
              setPage(1);
            }}
          >
            <label className="sr-only" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
            />
            <button>Search</button>
          </form>
        )}
        {filterStatus && (
          <select
            aria-label="Filter status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Restricted</option>
          </select>
        )}
        <button className="quiet" onClick={result.retry}>
          Refresh
        </button>
      </div>
      <Notice {...result} />
      {result.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((row) => (
                  <tr key={String(row.id)}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        {c.render ? c.render(row) : display(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.data.items.length && (
            <p className="notice">No records found.</p>
          )}
          <footer className="pagination">
            <span>
              {result.data.total.toLocaleString()} records · Page {page} of{" "}
              {Math.max(1, Math.ceil(result.data.total / pageSize))}
            </span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button
              disabled={page * pageSize >= result.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
export function Manage({
  kind,
  id,
  active,
  updated,
}: {
  kind: "businesses" | "users";
  id: string;
  active: boolean;
  updated: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"status" | "revoke-sessions" | "">("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (action && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [action]);
  const title =
    action === "revoke-sessions"
      ? "Revoke all sessions"
      : active
        ? "Restrict access"
        : "Reactivate access";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/platform-admin/${kind}/${id}/${action}`, {
        method: action === "status" ? "PATCH" : "POST",
        body: JSON.stringify({
          reason: reason.trim(),
          confirmed,
          ...(action === "status" ? { isActive: !active } : {}),
        }),
      });
      setAction("");
      setMessage("Action completed and recorded in the audit log.");
      updated();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="actions">
        <button
          className={active ? "danger" : ""}
          onClick={() => {
            setAction("status");
            setReason("");
            setConfirmed(false);
            setError("");
          }}
        >
          {active ? "Restrict access" : "Reactivate"}
        </button>
        {kind === "users" && (
          <button
            onClick={() => {
              setAction("revoke-sessions");
              setReason("");
              setConfirmed(false);
              setError("");
            }}
          >
            Revoke sessions
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {action && (
        <dialog
          ref={dialog}
          aria-labelledby="action-title"
          className="modal"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setAction("");
          }}
        >
          <h2 id="action-title">{title}</h2>
          <p>
            {action === "revoke-sessions"
              ? "All issued access and refresh tokens will stop working."
              : kind === "businesses"
                ? "Restricted businesses cannot use business APIs. Users may still sign in and access other active businesses."
                : "Restricted users cannot sign in, refresh tokens, or use authenticated APIs. Reactivation requires a fresh login."}
          </p>
          <form onSubmit={submit}>
            <label>
              Reason
              <textarea
                autoFocus
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this action for {id}.
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAction("")}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !confirmed || reason.trim().length < 5}
              >
                {busy ? "Saving…" : title}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
