import { CancelBill } from "./cancel-bill";
import { BillEdited, EditBillItems } from "./edit-bill-items";
import { editedSummary } from "./bill-edit";
import { BillNotes, ReturnItems } from "./return-items";
import { hasReturns, noteName, noteRows, returnSummary, type Bill } from "./bill-returns";
import { StockAdjustment } from "./stock-adjustment";
import { SaleCreator } from "./sale-creator";
import { billGstLabel, chargeGstSwitch, saleTotals, type SaleProduct } from "./sale-model";
import { GST_STATES, inventoryMovementLabel, inventoryMovementNote, type EffectiveAccess, type Permission } from "@invento/shared";
import { firstFieldError } from "./form-validation";
import { AccessManagement } from "./access-management";
import React, { useState } from "react";
import { api, type PanelAccess } from "./api";
import { changedFields, istDateInput } from "./transaction-edit";
import {
  display,
  label,
  Notice,
  useLoad,
  Manage,
  status,
  type Row,
} from "./components";

type Field = {
  key: string;
  /** Labelled choices with a blank "Not set" option, for optional selects. */
  choices?: { value: string; label: string }[];
  title?: string;
  required?: boolean;
  options?: string[];
  type?: string;
  max?: number;
};
const field = (key: string, required = false, options?: string[]): Field => ({
  key,
  required,
  options,
});
const personFields = [
  field("name", true),
  field("contactName"),
  { key: "phone", type: "tel" },
  { key: "email", type: "email" },
  field("address"),
  { key: "gstin", title: "GSTIN", type: "gstin", max: 20 },
];
const stateChoices = Object.entries(GST_STATES)
  .map(([value, name]) => ({ value, label: `${name} (${value})` }))
  .sort((a, b) => a.label.localeCompare(b.label));
const productFields = [
  field("name", true),
  field("sku", true),
  field("unit", true, [
    "PIECE",
    "KG",
    "GRAM",
    "LITRE",
    "MILLILITRE",
    "METRE",
    "SQUARE_FOOT",
    "FOOT",
    "PACK",
    "BOX",
    "DOZEN",
    "OTHER",
  ]),
  field("purchasePrice", true),
  field("sellingPrice", true),
  field("minimumStock", true),
  { key: "gstRate", title: "GST rate (%)", type: "gst-rate", required: true, max: 6 },
  { key: "hsnCode", title: "HSN code", type: "hsn", max: 10 },
  field("barcode"),
  field("category"),
];
const sections = [
  "overview",
  "products",
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "inventory",
  "team",
  "roles",
  "settings",
];

async function shopApi<T>(id: string, path: string, init: RequestInit = {}) {
  return api<T>(path, {
    ...init,
    headers: { ...init.headers, "X-Business-Id": id },
  });
}

function Editor({
  title,
  fields,
  initial = {},
  save,
  cancel,
  submitLabel = "Save changes",
}: {
  title: string;
  fields: Field[];
  initial?: Row;
  save: (data: Row) => Promise<void>;
  cancel?: () => void;
  submitLabel?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel shop-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const values = Object.fromEntries(
          new FormData(e.currentTarget).entries(),
        );
        const data = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => value !== "" || initial[key] != null,
          ),
        );
        const invalid = firstFieldError(fields, values);
        if (invalid) {
          setError(invalid);
          return;
        }
        setBusy(true);
        setError("");
        try {
          await save(data);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{title}</h2>
      <div className="shop-fields">
        {fields.map((f) => (
          <label key={f.key}>
            {f.title || label(f.key)}
            {f.required ? " *" : ""}
            {f.choices ? (
              <select name={f.key} defaultValue={String(initial[f.key] ?? "")}>
                <option value="">Not set</option>
                {f.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            ) : f.options ? (
              <select
                name={f.key}
                defaultValue={String(initial[f.key] ?? f.options[0])}
                required={f.required}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {label(o.replaceAll("_", " ").toLowerCase())}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.key}
                type={f.type === "gstin" || f.type === "hsn" || f.type === "gst-rate" ? "text" : f.type || "text"}
                inputMode={f.type === "hsn" ? "numeric" : f.type === "gst-rate" ? "decimal" : undefined}
                style={f.type === "gstin" ? { textTransform: "uppercase" } : undefined}
                required={f.required}
                maxLength={f.max ?? 160}
                defaultValue={String(initial[f.key] ?? "")}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {cancel && (
          <button type="button" onClick={cancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Records({
  rows,
  keys,
  titles,
  edit,
}: {
  rows: Row[];
  keys: string[];
  titles?: Record<string, string>;
  edit?: (row: Row) => void;
}) {
  return (
    <section className="panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{titles?.[k] ?? (k === "sku" ? "SKU" : label(k))}</th>
              ))}
              {edit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.id ?? i)}>
                {keys.map((k) => (
                  <td key={k}>
                    {k === "status" ? (
                      <span
                        className={`badge ${row[k] === "ACTIVE" || row[k] === "COMPLETED" ? "active" : row[k] === "INACTIVE" || row[k] === "CANCELLED" ? "inactive" : ""}`}
                      >
                        {String(row[k] ?? "—")
                          .replaceAll("_", " ")
                          .toLowerCase()
                          .replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    ) : k === "unit" ? (
                      String(row[k] ?? "—")
                        .replaceAll("_", " ")
                        .toLowerCase()
                    ) : (
                      display(row[k])
                    )}
                  </td>
                ))}
                {edit && (
                  <td>
                    {row.isWalkIn || row.status === "CANCELLED" ? (
                      <span className="muted">{row.isWalkIn ? "Built in" : "—"}</span>
                    ) : (
                      <button onClick={() => edit(row)}>Edit</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="notice">No records yet.</p>}
    </section>
  );
}

export function ShopWorkspace({
  shops,
  platform,
  requestedId,
  initialSection,
}: {
  shops: PanelAccess["shops"];
  platform: boolean;
  requestedId?: string;
  initialSection?: string;
}) {
  const permittedId =
    requestedId && (platform || shops.some((shop) => shop.id === requestedId));
  const id = permittedId ? requestedId : undefined;
  if (requestedId && !id)
    return (
      <p role="alert" className="notice">
        This business is not in your active memberships.{" "}
        <a href="#/shops">Return to your businesses</a>
      </p>
    );
  return (
    <>
      {!id && (
        <div className="page-heading">
          <div>
            <p className="eyebrow">BUSINESS MANAGEMENT</p>
            <h1>Your businesses</h1>
            <p className="muted">
              Choose a business to open its management workspace.
            </p>
          </div>
        </div>
      )}
      {id ? (
        <Shop
          key={`${id}/${initialSection || "overview"}`}
          id={id}
          initialSection={initialSection}
          platform={platform}
          shops={shops}
        />
      ) : platform ? (
        <p>
          <a href="#/businesses">
            Choose a business from the business directory →
          </a>
        </p>
      ) : (
        <div className="business-picker">
          {shops.map((shop) => (
            <a
              className="business-choice"
              key={shop.id}
              href={`#/shops/${encodeURIComponent(shop.id)}`}
            >
              <strong>{shop.name}</strong>
              <span>{shop.slug}</span>
              <span className="business-choice-action">Manage business →</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function useEffectiveAccess(id: string, revision: number) {
  const [state, setState] = useState<{
    data?: EffectiveAccess;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [retry, setRetry] = useState(0);
  React.useEffect(() => {
    let current = true;
    api<EffectiveAccess>(`/businesses/${encodeURIComponent(id)}/access/me`)
      .then((data) => {
        if (current) setState({ data, loading: false });
      })
      .catch((error) => {
        if (current) setState({ error: error.message, loading: false });
      });
    return () => {
      current = false;
    };
  }, [id, revision, retry]);
  return { ...state, retry: () => setRetry((v) => v + 1) };
}

function Shop({
  id,
  initialSection = "overview",
  platform = false,
  shops,
}: {
  id: string;
  platform?: boolean;
  shops: PanelAccess["shops"];
  initialSection?: string;
}) {
  const [revision, setRevision] = useState(0);
  const access = useEffectiveAccess(id, revision);
  const business = useLoad<Row>(
    `${platform ? "/platform-admin" : ""}/businesses/${encodeURIComponent(id)}`,
    revision,
  );
  const [section, setSection] = useState(initialSection);
  React.useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const sectionPermission: Record<string, Permission> = {
    overview: "reports.view",
    products: "products.view",
    customers: "customers.view",
    suppliers: "suppliers.view",
    sales: "sales.view",
    purchases: "purchases.view",
    inventory: "inventory.view",
    team: "members.view",
    roles: "roles.view",
    settings: "business.update",
  };
  const can = (p: Permission) => !!access.data?.permissions.includes(p);
  const visible = sections.filter((s) => can(sectionPermission[s]));
  const active = visible.includes(section)
    ? section
    : section === "roles"
      ? undefined
      : visible[0];
  return (
    <>
      <a className="back" href={platform ? "#/businesses" : "#/shops"}>
        ← Back to businesses
      </a>
      {business.data && (
        <div className="business-header">
          <div>
            <h1>{String(business.data.name)}</h1>
            <p>Business workspace · Operations, team and access</p>
          </div>
          <div className="header-actions">
            {!platform && shops.length > 1 && (
              <select
                aria-label="Selected business"
                value={id}
                onChange={(event) => {
                  location.hash = `/shops/${encodeURIComponent(event.target.value)}`;
                }}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            )}
            {status(business.data.isActive)}
            {platform && (
              <Manage
                kind="businesses"
                id={id}
                active={Boolean(business.data.isActive)}
                updated={() => setRevision((v) => v + 1)}
              />
            )}
          </div>
        </div>
      )}
      {platform && <Notice {...business} />}
      {business.data?.isActive === false ? (
        <p className="notice">
          This business is suspended. Reactivate it to manage its operations.
        </p>
      ) : (
        <Notice {...access} />
      )}
      {access.data && business.data?.isActive !== false && (
        <>
          <div className="tabs" role="tablist" aria-label="Business sections">
            {visible.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={active === s}
                onClick={() => setSection(s)}
              >
                {label(s)}
              </button>
            ))}
          </div>
          {active === "team" || active === "roles" ? (
            <AccessManagement
              id={id}
              access={access.data}
              refreshAccess={() => setRevision((v) => v + 1)}
            />
          ) : active ? (
            <ShopSection
              key={`${id}/${active}/${access.data.permissions.join(",")}`}
              id={id}
              section={active}
              permissions={access.data.permissions}
            />
          ) : (
            <p>
              {section === "roles"
                ? "Your role does not include roles.view for this shop. Ask the shop owner to assign the required permissions."
                : "No shop features are assigned. Contact your business owner."}
            </p>
          )}
        </>
      )}
    </>
  );
}

function ShopSection({
  id,
  section,
  permissions,
}: {
  id: string;
  section: string;
  permissions: Permission[];
}) {
  const can = (p: string) => permissions.includes(p as Permission);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const refresh = (message = "Saved successfully.") => {
    setRevision((v) => v + 1);
    setEditing(null);
    setMessage(message);
  };
  // Sale and purchase edits show and compare the bill's calendar date in India.
  const dateKey = section === "sales" ? "saleDate" : "purchaseDate";
  const editingInitial: Row = editing
    ? { ...editing, [dateKey]: istDateInput(editing[dateKey]) }
    : {};
  const businessPath = `/businesses/${encodeURIComponent(id)}`;
  const path =
    section === "overview"
      ? "/dashboard/summary"
      : section === "team"
        ? `${businessPath}/users`
        : section === "settings"
          ? businessPath
          : `/${section}`;
  // useLoad uses api directly; include the tenant header through a dedicated loader.
  const result = useShopLoad<Row | Row[]>(id, path, revision);
  const rows = Array.isArray(result.data) ? result.data : [];
  const fields =
    section === "products"
      ? productFields.filter(
          (f) =>
            !editing?.id || f.key !== "purchasePrice" || can("pricing.view"),
        )
      : personFields;
  const catalog = ["products", "customers", "suppliers"].includes(section);
  // Owners and admins change a saved bill's items; a purchase's also need cost prices.
  const mayEditItems = can(`${section}.edit`) && (section === "sales" || can("pricing.view"));
  return (
    <>
      <Notice {...result} />
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {section === "overview" && result.data && !Array.isArray(result.data) && (
        <>
          <p className="muted">Today · Asia/Kolkata</p>
          <div className="metrics">
            {[
              "todaySales",
              "todayPurchases",
              "saleCount",
              "purchaseCount",
              "productCount",
              "lowStockCount",
            ].map((k) => (
              <article className="metric" key={k}>
                <p>{label(k)}</p>
                <strong>{display((result.data as Row)[k])}</strong>
              </article>
            ))}
          </div>
        </>
      )}
      {catalog && (
        <>
          <div className="section-heading">
            <div>
              <h2>{label(section)}</h2>
              <p>
                {rows.length} active {rows.length === 1 ? "record" : "records"}{" "}
                · Manage your business directory
              </p>
            </div>
            <button
              className="primary"
              hidden={!can(`${section}.create`)}
              onClick={() => setEditing(section === "products" ? { gstRate: "0" } : {})}
            >
              + Add{" "}
              {section === "products"
                ? "product"
                : section === "customers"
                  ? "customer"
                  : "supplier"}
            </button>
          </div>
          {editing && (
            <Editor
              key={String(editing.id || "new")}
              title={editing.id ? "Edit record" : "New record"}
              fields={
                editing.id
                  ? [
                      ...fields,
                      ...(can(`${section}.delete`) ||
                      editing.status === "INACTIVE"
                        ? [field("status", true, ["ACTIVE", "INACTIVE"])]
                        : []),
                    ]
                  : fields
              }
              initial={editing}
              cancel={() => setEditing(null)}
              save={async (data) => {
                await shopApi(
                  id,
                  `/${section}${editing.id ? `/${encodeURIComponent(String(editing.id))}` : ""}`,
                  {
                    method: editing.id ? "PATCH" : "POST",
                    body: JSON.stringify(data),
                  },
                );
                // A new record closes the form and returns to the list with what was added.
                refresh(
                  editing.id
                    ? undefined
                    : `${section === "products" ? "Product" : section === "customers" ? "Customer" : "Supplier"} added: ${String(data.name ?? "")}.`,
                );
              }}
            />
          )}
          <Records
            rows={rows}
            keys={
              section === "products"
                ? [
                    "name",
                    "sku",
                    "unit",
                    "purchasePrice",
                    "sellingPrice",
                    "gstRate",
                    "hsnCode",
                    "minimumStock",
                    "status",
                  ]
                : ["name", "contactName", "phone", "email", "gstin", "status"]
            }
            titles={{ gstin: "GSTIN", gstRate: "GST %", hsnCode: "HSN" }}
            edit={can(`${section}.update`) ? setEditing : undefined}
          />
          <details className="panel">
            <summary>Inactive records</summary>
            <Inactive
              id={id}
              section={section}
              edit={can(`${section}.update`) ? setEditing : undefined}
              revision={revision}
            />
          </details>
        </>
      )}
      {["sales", "purchases"].includes(section) && (
        <>
          {can(`${section}.create`) && (
            <TransactionForm id={id} section={section} saved={refresh} />
          )}
          <Records
            rows={rows.map((r) => ({
              ...r,
              gstState: billGstLabel(section === "sales" ? "sale" : "purchase", r),
              returnSummary: returnSummary(r as unknown as Bill) || null,
              edited: editedSummary(r)?.title.replace(/^Edited · /, "") ?? null,
            }))}
            keys={[
              "documentNumber",
              "invoiceNumber",
              section === "sales" ? "saleDate" : "purchaseDate",
              "total",
              "returnSummary",
              "gstState",
              "status",
              "edited",
              "note",
            ]}
            titles={
              section === "sales"
                ? { documentNumber: "Invoice no.", invoiceNumber: "Reference", gstState: "Bill type", returnSummary: "Returns" }
                : { documentNumber: "Purchase no.", invoiceNumber: "Supplier invoice", gstState: "GST", returnSummary: "Returns" }
            }
            edit={can(`${section}.update`) || mayEditItems ? setEditing : undefined}
          />
          {editing && can(`${section}.update`) && (
            <Editor
              key={String(editing.id)}
              title={
                editing.documentNumber
                  ? `Edit ${String(editing.documentNumber)}`
                  : "Edit transaction details"
              }
              fields={[
                {
                  key: "invoiceNumber",
                  title: section === "sales" ? "Reference" : "Supplier invoice",
                },
                {
                  key: section === "sales" ? "saleDate" : "purchaseDate",
                  type: "date",
                  required: true,
                },
                field("note"),
              ]}
              initial={editingInitial}
              cancel={() => setEditing(null)}
              save={async (data) => {
                await shopApi(
                  id,
                  `/${section}/${encodeURIComponent(String(editing.id))}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify(changedFields(data, editingInitial)),
                  },
                );
                refresh();
              }}
            />
          )}
          {editing && <BillEdited bill={editing} />}
          {editing && mayEditItems && (
            <EditBillItems
              key={`items-${String(editing.id)}`}
              shopId={id}
              kind={section === "sales" ? "sale" : "purchase"}
              bill={editing}
              done={refresh}
            />
          )}
          {editing && <BillNotes kind={section === "sales" ? "sale" : "purchase"} bill={editing} />}
          {editing && can(`${section}.return`) && (
            <ReturnItems
              key={`return-${String(editing.id)}`}
              shopId={id}
              kind={section === "sales" ? "sale" : "purchase"}
              bill={editing}
              done={refresh}
            />
          )}
          {/* A bill with returns cannot be cancelled. */}
          {editing && editing.status === "COMPLETED" && !hasReturns(editing as unknown as Bill) && can(`${section}.cancel`) && (
            <CancelBill
              key={`cancel-${String(editing.id)}`}
              shopId={id}
              kind={section === "sales" ? "sale" : "purchase"}
              bill={editing}
              done={() => {
                setEditing(null);
                refresh();
              }}
            />
          )}
          {noteRows(section === "sales" ? "sale" : "purchase", rows as unknown as Bill[]).length > 0 && (
            <>
              <div className="section-heading">
                <div>
                  <h2>{noteName(section === "sales" ? "sale" : "purchase")}s</h2>
                  <p>
                    {section === "sales" ? "Items customers returned" : "Items sent back to suppliers"} · newest first
                  </p>
                </div>
              </div>
              <Records
                rows={noteRows(section === "sales" ? "sale" : "purchase", rows as unknown as Bill[])}
                keys={["documentNumber", "returnDate", "billNumber", "party", "total", "settlement", "reason"]}
                titles={{
                  documentNumber: "Note no.",
                  returnDate: "Date",
                  billNumber: section === "sales" ? "Against invoice" : "Against purchase",
                  party: section === "sales" ? "Customer" : "Supplier",
                  total: "Value",
                  settlement: "Settled as",
                }}
              />
            </>
          )}
        </>
      )}
      {section === "inventory" && (
        <>
          {can("inventory.adjust") && <StockForm key={revision} id={id} stock={rows} saved={refresh} />}
          <Records
            rows={rows.map((r) => ({ ...r, name: (r.product as Row)?.name }))}
            keys={["name", "quantity", "updatedAt"]}
          />
          <Activity id={id} revision={revision} />
        </>
      )}

      {section === "settings" && result.data && !Array.isArray(result.data) && (
        <>
          <Editor
            key={revision}
            title="Shop details"
            fields={[
              field("name", true),
              { key: "email", type: "email" },
              { key: "phone", type: "tel" },
              field("address"),
              { key: "gstin", title: "GSTIN (leave blank if not registered)", type: "gstin", max: 20 },
              { key: "stateCode", title: "State (set from the GSTIN when registered)", choices: stateChoices },
              { key: "invoicePrefix", title: "Sales invoice prefix (e.g. INV)", max: 3 },
              { key: "purchasePrefix", title: "Purchase number prefix (e.g. PUR)", max: 3 },
            ]}
            initial={result.data}
            save={async (data) => {
              await api(businessPath, {
                method: "PATCH",
                body: JSON.stringify(data),
              });
              refresh();
            }}
          />
          {can("pricing.manage") && <Pricing id={id} />}
        </>
      )}
    </>
  );
}

function useShopLoad<T>(id: string, path: string, revision = 0) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [retry, setRetry] = useState(0);
  React.useEffect(() => {
    let current = true;
    setState({ loading: true });
    shopApi<T>(id, path)
      .then((data) => {
        if (current) setState({ data, loading: false });
      })
      .catch((e) => {
        if (current) setState({ loading: false, error: e.message });
      });
    return () => {
      current = false;
    };
  }, [id, path, revision, retry]);
  return { ...state, retry: () => setRetry((v) => v + 1) };
}
function Inactive({
  id,
  section,
  edit,
  revision,
}: {
  id: string;
  section: string;
  edit?: (r: Row) => void;
  revision: number;
}) {
  const result = useShopLoad<Row[]>(
    id,
    `/${section}?status=INACTIVE`,
    revision,
  );
  return (
    <>
      <Notice {...result} />
      <Records rows={result.data || []} keys={["name", "status"]} edit={edit} />
    </>
  );
}
function Activity({ id, revision }: { id: string; revision: number }) {
  const result = useShopLoad<Row[]>(id, "/inventory/activity", revision);
  return (
    <>
      <h2>Recent stock movements</h2>
      <Notice {...result} />
      <Records
        rows={(result.data || []).map((r) => ({
          ...r,
          name: (r.product as Row)?.name,
          type: inventoryMovementLabel(String(r.type)),
          note: inventoryMovementNote(r.note as string | null),
        }))}
        keys={["name", "type", "quantity", "balanceAfter", "note"]}
      />
    </>
  );
}
function StockForm({ id, stock, saved }: { id: string; stock: Row[]; saved: (message: string) => void }) {
  const products = useShopLoad<Row[]>(id, "/products");
  const [mode, setMode] = useState("adjustments");
  return (
    <>
      <label>
        Stock action
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="adjustments">Adjust stock (count, add or remove)</option>
          <option value="opening-stock">
            Opening stock (once per product)
          </option>
        </select>
      </label>
      <Notice {...products} />
      {products.data && mode === "adjustments" && (
        <StockAdjustment shopId={id} products={products.data} stock={stock} saved={saved} />
      )}
      {products.data && mode === "opening-stock" && products.data.every((p) => stock.some((s) => s.productId === p.id)) && (
        <p className="muted">Every product already has its opening stock.</p>
      )}
      {products.data && mode === "opening-stock" && !products.data.every((p) => stock.some((s) => s.productId === p.id)) && (
        <RecordProductForm
          products={products.data.filter((p) => !stock.some((s) => s.productId === p.id))}
          fields={[field("quantity", true), field("note")]}
          title="Record opening stock"
          save={async (data) => {
            await shopApi(id, "/inventory/opening-stock", {
              method: "POST",
              body: JSON.stringify(data),
            });
            saved("Opening stock recorded.");
          }}
        />
      )}
    </>
  );
}
function RecordProductForm({
  products,
  fields,
  title,
  save,
}: {
  products: Row[];
  fields: Field[];
  title: string;
  save: (data: Row) => Promise<void>;
}) {
  // Product names are visible in the selector; IDs are sent only to the API.
  const [productId, setProductId] = useState(String(products[0]?.id || ""));
  if (!products.length) return <p>Add a product first.</p>;
  return (
    <div className="product-entry">
      <label>
        Product
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option value={String(p.id)} key={String(p.id)}>
              {String(p.name)} · {String(p.sku)}
            </option>
          ))}
        </select>
      </label>
      <Editor
        title={title}
        fields={fields}
        submitLabel={title === "Add line item" ? "Add item" : "Save stock"}
        save={(data) => save({ ...data, productId })}
      />
    </div>
  );
}
function TransactionForm({
  id,
  section,
  saved,
}: {
  id: string;
  section: string;
  saved: () => void;
}) {
  const sale = section === "sales";
  const products = useShopLoad<Row[]>(id, "/products");
  const people = useShopLoad<Row[]>(id, sale ? "/customers" : "/suppliers");
  const shop = useShopLoad<Row>(id, `/businesses/${encodeURIComponent(id)}`);
  const [person, setPerson] = useState("");
  // "Supplier charged GST", off by default on every new purchase.
  const [chargeGst, setChargeGst] = useState(false);
  const [lines, setLines] = useState<Row[]>([]);
  const [version, setVersion] = useState(0);
  if (sale)
    return (
      <>
        <Notice {...products} />
        <Notice {...people} />
        <Notice {...shop} />
        {products.data && people.data && shop.data && (
          <SaleCreator
            id={id}
            products={products.data as unknown as SaleProduct[]}
            customers={people.data}
            shop={shop.data}
            saved={saved}
          />
        )}
      </>
    );
  return (
    <details className="panel">
      <summary>+ New {sale ? "sale" : "purchase"}</summary>
      <div className="disclosure-body">
        <Notice {...products} />
        <Notice {...people} />
        <label>
          {sale ? "Customer" : "Supplier"}
          <select
            value={person}
            required
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">Select {sale ? "customer" : "supplier"}</option>
            {people.data?.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.name)}
              </option>
            ))}
          </select>
        </label>
        {products.data && (
          <RecordProductForm
            key={version}
            products={products.data}
            title="Add line item"
            fields={[
              field("quantity", true),
              field(sale ? "sellingPrice" : "purchasePrice", true),
            ]}
            save={async (data) => {
              if (
                !/^\d{1,9}(?:\.\d{1,3})?$/.test(String(data.quantity)) ||
                Number(data.quantity) <= 0 ||
                !/^\d{1,10}(?:\.\d{1,2})?$/.test(
                  String(data[sale ? "sellingPrice" : "purchasePrice"]),
                ) ||
                Number(data[sale ? "sellingPrice" : "purchasePrice"]) <= 0
              )
                throw new Error(
                  "Enter a positive quantity and price within the supported precision.",
                );
              if (lines.some((l) => l.productId === data.productId))
                throw new Error(
                  "This product is already included. Remove it before adding it again.",
                );
              setLines([...lines, data]);
              setVersion((v) => v + 1);
            }}
          />
        )}
        {lines.map((line, index) => (
          <div className="transaction-line" key={String(line.productId)}>
            {String(products.data?.find((p) => p.id === line.productId)?.name)}{" "}
            · {String(line.quantity)} ×{" "}
            {String(line[sale ? "sellingPrice" : "purchasePrice"])}{" "}
            <button
              onClick={() => setLines(lines.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <PurchaseGst
          lines={lines}
          products={products.data ?? []}
          chargeGst={chargeGst}
          setChargeGst={setChargeGst}
        />
        <Editor
          key={`transaction-${version}`}
          title="Transaction details"
          submitLabel={sale ? "Create sale" : "Create purchase"}
          fields={[
            {
              key: sale ? "saleDate" : "purchaseDate",
              required: true,
              type: "date",
            },
            field("invoiceNumber"),
            ...(sale
              ? [
                  field("paymentMethod", true, [
                    "CASH",
                    "UPI",
                    "CARD",
                    "BANK_TRANSFER",
                    "OTHER",
                  ]),
                ]
              : []),
            field("note"),
          ]}
          save={async (data) => {
            if (!person || !lines.length)
              throw new Error(
                "Select a customer or supplier and add at least one line item.",
              );
            await shopApi(id, `/${section}`, {
              method: "POST",
              body: JSON.stringify({
                ...data,
                [sale ? "customerId" : "supplierId"]: person,
                chargeGst,
                items: lines,
              }),
            });
            setLines([]);
            setChargeGst(false);
            setVersion((v) => v + 1);
            saved();
          }}
        />
      </div>
    </details>
  );
}
/** The purchase's GST checkbox and its totals, computed as the API will. */
function PurchaseGst({
  lines,
  products,
  chargeGst,
  setChargeGst,
}: {
  lines: Row[];
  products: Row[];
  chargeGst: boolean;
  setChargeGst: (value: boolean) => void;
}) {
  const note = chargeGstSwitch("purchase", chargeGst, null).note;
  let totals: ReturnType<typeof saleTotals> | null = null;
  try {
    totals = saleTotals(
      lines.map((line) => ({
        product: (products.find((p) => p.id === line.productId) ??
          { id: String(line.productId), name: "", sellingPrice: "0" }) as unknown as SaleProduct,
        quantity: String(line.quantity),
        price: String(line.purchasePrice),
      })),
      {},
      chargeGst,
    );
  } catch {
    // Lines are validated when added; a stale product list shows no totals.
  }
  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
  return (
    <>
      <label className="checkbox charge-gst">
        <input
          type="checkbox"
          checked={chargeGst}
          aria-describedby="purchase-gst-note"
          onChange={(e) => setChargeGst(e.target.checked)}
        />
        <span>
          <strong>Supplier charged GST</strong>
          <small id="purchase-gst-note">{note}</small>
        </span>
      </label>
      {totals && lines.length > 0 && (
        <p className="muted">
          Subtotal {money(totals.subtotal)} · GST {money(totals.tax)} ·{" "}
          <strong>Total {money(totals.total)}</strong>
        </p>
      )}
    </>
  );
}
function Pricing({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const result = useLoad<Row>(
    `/businesses/${encodeURIComponent(id)}/pricing-access`,
    revision,
  );
  return (
    <>
      <Notice {...result} />
      {result.data && (
        <Editor
          key={revision}
          title="Member purchase-price access"
          fields={[
            {
              key: "visibility",
              title: "Members may view purchase prices",
              options: ["Allowed", "Hidden"],
            },
          ]}
          initial={{
            visibility: result.data.membersCanViewPurchasePrice
              ? "Allowed"
              : "Hidden",
          }}
          save={async (data) => {
            await api(`/businesses/${encodeURIComponent(id)}/pricing-access`, {
              method: "PATCH",
              body: JSON.stringify({
                membersCanViewPurchasePrice: data.visibility === "Allowed",
              }),
            });
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
