import React, { useState } from "react";
import {
  type Row,
  type Column,
  label,
  date,
  status,
  display,
  useLoad,
  Notice,
  Table,
  Manage,
} from "./components";

export function Overview() {
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState("");
  const result = useLoad<Row>(`/platform-admin/overview${range}`);
  const keys = [
    "businesses",
    "activeBusinesses",
    "suspendedBusinesses",
    "users",
    "loggedInToday",
    "active7Days",
    "active30Days",
    "products",
    "sales",
    "purchases",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLATFORM AT A GLANCE</p>
          <h1>Overview</h1>
          <p className="muted">
            A clear view of your businesses, people, and activity.
          </p>
        </div>
        <span className="badge active">Live database totals</span>
      </div>
      <form
        className="panel range"
        onSubmit={(e) => {
          e.preventDefault();
          setRange(`?from=${from}T00:00:00.000Z&to=${to}T00:00:00.000Z`);
        }}
      >
        <label>
          From (UTC)
          <input
            required
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Until, exclusive (UTC)
          <input
            required
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button>Apply period</button>
      </form>
      <Notice {...result} />
      {result.data && (
        <>
          <div className="metrics">
            {keys.map((key) => (
              <article className="metric" key={key}>
                <p>{label(key)}</p>
                <strong>{Number(result.data![key]).toLocaleString()}</strong>
                <small>
                  {["sales", "purchases"].includes(key)
                    ? "Completed · selected period"
                    : key.includes("Days")
                      ? "Authenticated API activity"
                      : key === "loggedInToday"
                        ? "Unique users · since 00:00 UTC"
                        : "Current total"}
                </small>
              </article>
            ))}
          </div>
          <div className="panel definitions">
            <h2>How to read these numbers</h2>
            <p>{String(result.data.activityTracking)}</p>
            <p>
              Sales and purchases use their transaction dates, from inclusive to
              exclusive. Totals include active and restricted accounts. Recent
              activity is not an online presence indicator.
            </p>
            <p>
              Period: {date((result.data.period as Row).from)} →{" "}
              {date((result.data.period as Row).to)}
            </p>
            <p>
              Business-wide recent activity history is unavailable. It was not
              previously recorded.
            </p>
          </div>
        </>
      )}
    </>
  );
}
const commonStatus: Column = {
  key: "isActive",
  label: "Status",
  render: (row) => status(row.isActive),
};
const created: Column = {
  key: "createdAt",
  label: "Created",
  render: (row) => date(row.createdAt),
};
const resources: Record<string, Column[]> = {
  members: [
    {
      key: "user",
      label: "User",
      render: (r) => (
        <a href={`#/users/${(r.user as Row).id}`}>
          {String((r.user as Row).name)}
        </a>
      ),
    },
    { key: "role", label: "Role" },
    commonStatus,
    created,
  ],
  products: [
    { key: "name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "unit", label: "Unit" },
    {
      key: "inventory",
      label: "Current stock",
      render: (r) => display((r.inventory as Row | null)?.quantity ?? "0"),
    },
    { key: "purchasePrice", label: "Purchase price" },
    { key: "sellingPrice", label: "Selling price" },
    { key: "status", label: "Status" },
  ],
  sales: [
    { key: "id", label: "Sale" },
    { key: "invoiceNumber", label: "Invoice" },
    { key: "saleDate", label: "Date", render: (r) => date(r.saleDate) },
    { key: "total", label: "Total" },
    { key: "status", label: "Status" },
  ],
  purchases: [
    { key: "id", label: "Purchase" },
    { key: "invoiceNumber", label: "Invoice" },
    { key: "purchaseDate", label: "Date", render: (r) => date(r.purchaseDate) },
    { key: "total", label: "Total" },
    { key: "status", label: "Status" },
  ],
  "inventory-movements": [
    { key: "productId", label: "Product ID" },
    { key: "type", label: "Movement" },
    { key: "quantity", label: "Quantity" },
    { key: "balanceAfter", label: "Balance after" },
    created,
  ],
  memberships: [
    {
      key: "business",
      label: "Business",
      render: (r) => (
        <a href={`#/businesses/${(r.business as Row).id}`}>
          {String((r.business as Row).name)}
        </a>
      ),
    },
    { key: "role", label: "Role" },
    commonStatus,
  ],
  sessions: [
    { key: "id", label: "Session reference" },
    created,
    { key: "expiresAt", label: "Expires", render: (r) => date(r.expiresAt) },
  ],
};
export function Detail({
  kind,
  id,
}: {
  kind: "businesses" | "users";
  id: string;
}) {
  const [revision, setRevision] = useState(0);
  const result = useLoad<Row>(`/platform-admin/${kind}/${id}`, revision);
  const tabs =
    kind === "businesses"
      ? ["members", "products", "sales", "purchases", "inventory-movements"]
      : ["memberships", "sessions"];
  const [tab, setTab] = useState(tabs[0]);
  return (
    <>
      <a className="back" href={`#/${kind}`}>
        ← Back to {kind}
      </a>
      <Notice {...result} />
      {result.data && (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {kind === "businesses" ? "BUSINESS" : "USER"} DETAILS
              </p>
              <h1>{String(result.data.name)}</h1>
              <p className="muted">{id}</p>
              {kind === "businesses" && (
                <a
                  className="primary"
                  href={`#/shops/${encodeURIComponent(id)}`}
                >
                  Manage this shop →
                </a>
              )}
            </div>
            {status(result.data.isActive)}
          </div>
          <section className="panel detail-grid">
            {Object.entries(result.data)
              .filter(([key]) => !["_count", "name", "id"].includes(key))
              .map(([key, value]) => (
                <div key={key}>
                  <small>{label(key)}</small>
                  <p>{key.endsWith("At") ? date(value) : display(value)}</p>
                </div>
              ))}
          </section>
          <Manage
            kind={kind}
            id={id}
            active={Boolean(result.data.isActive)}
            updated={() => setRevision((v) => v + 1)}
          />
          <div className="tabs" role="tablist">
            {tabs.map((name) => (
              <button
                role="tab"
                aria-selected={tab === name}
                key={name}
                onClick={() => setTab(name)}
              >
                {label(name.replaceAll("-", " "))}
              </button>
            ))}
          </div>
          {tab === "sessions" && (
            <p className="muted">
              Unexpired, unrevoked refresh sessions. Rotated tokens are
              excluded; device and IP details are not tracked.
            </p>
          )}
          <Table
            key={tab}
            path={`/platform-admin/${kind}/${id}/${tab}`}
            columns={resources[tab]}
            revision={revision}
          />
        </>
      )}
    </>
  );
}
export function Directory({ kind }: { kind: "businesses" | "users" }) {
  const columns: Column[] = [
    {
      key: "name",
      label: "Name",
      render: (r) => (
        <a
          href={
            kind === "businesses"
              ? `#/shops/${encodeURIComponent(String(r.id))}`
              : `#/${kind}/${r.id}`
          }
        >
          {String(r.name)}
        </a>
      ),
    },
    kind === "users"
      ? { key: "email", label: "Email" }
      : { key: "slug", label: "Slug" },
    commonStatus,
  ];
  if (kind === "businesses")
    columns.push(
      {
        key: "users",
        label: "Owners (up to 5)",
        render: (r) =>
          (r.users as { user: { name: string } }[])
            .map((m) => m.user.name)
            .join(", ") || "—",
      },
      {
        key: "_count",
        label: "Memberships",
        render: (r) => display((r._count as Row).users),
      },
    );
  else
    columns.push(
      {
        key: "isPlatformAdmin",
        label: "Platform access",
        render: (r) => (r.isPlatformAdmin ? "Administrator" : "None"),
      },
      {
        key: "lastLoginAt",
        label: "Last login",
        render: (r) => date(r.lastLoginAt),
      },
      {
        key: "lastActivityAt",
        label: "Last activity",
        render: (r) => date(r.lastActivityAt),
      },
    );
  columns.push(created);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLATFORM DIRECTORY</p>
          <h1>{label(kind)}</h1>
          <p className="muted">
            {kind === "businesses"
              ? "Select a business to manage its products, stock, people, roles, and settings."
              : "Accounts, activity, and access across Invento."}
          </p>
        </div>
      </div>
      <Table
        path={`/platform-admin/${kind}`}
        columns={columns}
        searchable
        filterStatus
      />
    </>
  );
}
export function Audit() {
  const [filters, setFilters] = useState({
    action: "",
    targetType: "",
    targetId: "",
    actorId: "",
    businessId: "",
  });
  const [query, setQuery] = useState("");
  const columns: Column[] = [
    created,
    { key: "actorId", label: "Administrator ID" },
    { key: "action", label: "Action" },
    { key: "targetType", label: "Target type" },
    { key: "targetId", label: "Target ID" },
    { key: "reason", label: "Reason" },
    { key: "previous", label: "Previous values" },
    { key: "next", label: "New values" },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNTABILITY</p>
          <h1>Audit log</h1>
          <p className="muted">
            Read-only history of platform management actions.
          </p>
        </div>
      </div>
      <form
        className="panel audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            new URLSearchParams(
              Object.fromEntries(
                Object.entries(filters).filter(([, value]) => value),
              ),
            ).toString(),
          );
        }}
      >
        {Object.entries(filters).map(([key, value]) => (
          <label key={key}>
            {label(key)}
            {key === "targetType" ? (
              <select
                value={value}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              >
                <option value="">All</option>
                <option value="business">Business</option>
                <option value="user">User</option>
              </select>
            ) : (
              <input
                maxLength={100}
                value={value}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        <button>Apply filters</button>
      </form>
      <Table
        key={query}
        path={`/platform-admin/audit-logs?${query}`}
        columns={columns}
      />
    </>
  );
}
