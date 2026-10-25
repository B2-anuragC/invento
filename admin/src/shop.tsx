import { type EffectiveAccess, type Permission } from "@invento/shared";
import { AccessManagement } from "./access-management";
import React, { useState } from "react";
import { api, type PanelAccess } from "./api";
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
  field("phone"),
  { key: "email", type: "email" },
  field("address"),
];
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
}: {
  title: string;
  fields: Field[];
  initial?: Row;
  save: (data: Row) => Promise<void>;
  cancel?: () => void;
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
            {f.options ? (
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
                type={f.type || "text"}
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
          {busy ? "Saving…" : "Save"}
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
  edit,
}: {
  rows: Row[];
  keys: string[];
  edit?: (row: Row) => void;
}) {
  return (
    <section className="panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{label(k)}</th>
              ))}
              {edit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.id ?? i)}>
                {keys.map((k) => (
                  <td key={k}>{display(row[k])}</td>
                ))}
                {edit && (
                  <td>
                    <button onClick={() => edit(row)}>Edit</button>
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
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUSINESS MANAGEMENT</p>
          <h1>{id ? "Business workspace" : "Your businesses"}</h1>
          <p className="muted">
            {id
              ? "Manage this business’s operations, people, roles, and settings."
              : "Choose a business to open its management workspace."}
          </p>
        </div>
        {!platform && id && shops.length > 1 && (
          <label>
            Selected business
            <select
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
          </label>
        )}
      </div>
      {id ? (
        <Shop
          key={`${id}/${initialSection || "overview"}`}
          id={id}
          initialSection={initialSection}
          platform={platform}
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
}: {
  id: string;
  platform?: boolean;
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
        <div className="page-heading">
          <h2>{String(business.data.name)}</h2>
          {status(business.data.isActive)}
        </div>
      )}
      {platform && <Notice {...business} />}
      {platform && business.data && (
        <Manage
          kind="businesses"
          id={id}
          active={Boolean(business.data.isActive)}
          updated={() => setRevision((v) => v + 1)}
        />
      )}
      {business.data?.isActive === false ? (
        <p className="notice">
          This business is suspended. Reactivate it to manage its operations.
        </p>
      ) : (
        <Notice {...access} />
      )}
      {access.data && business.data?.isActive !== false && (
        <>
          <div className="tabs" role="tablist">
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
  const refresh = () => {
    setRevision((v) => v + 1);
    setEditing(null);
    setMessage("Saved successfully.");
  };
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
  return (
    <>
      <Notice {...result} />
      {message && <p role="status">{message}</p>}
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
          <button
            hidden={!can(`${section}.create`)}
            onClick={() => setEditing({})}
          >
            Add{" "}
            {section === "products"
              ? "product"
              : section === "customers"
                ? "customer"
                : "supplier"}
          </button>
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
                refresh();
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
                    "minimumStock",
                    "status",
                  ]
                : ["name", "contactName", "phone", "email", "status"]
            }
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
            rows={rows}
            keys={[
              "invoiceNumber",
              section === "sales" ? "saleDate" : "purchaseDate",
              "total",
              "status",
              "note",
            ]}
            edit={can(`${section}.update`) ? setEditing : undefined}
          />
          {editing && (
            <Editor
              key={String(editing.id)}
              title="Edit transaction details"
              fields={[
                field("invoiceNumber"),
                {
                  key: section === "sales" ? "saleDate" : "purchaseDate",
                  type: "date",
                  required: true,
                },
                field("note"),
              ]}
              initial={{
                ...editing,
                [section === "sales" ? "saleDate" : "purchaseDate"]: String(
                  editing[section === "sales" ? "saleDate" : "purchaseDate"],
                ).slice(0, 10),
              }}
              cancel={() => setEditing(null)}
              save={async (data) => {
                await shopApi(
                  id,
                  `/${section}/${encodeURIComponent(String(editing.id))}`,
                  { method: "PATCH", body: JSON.stringify(data) },
                );
                refresh();
              }}
            />
          )}
        </>
      )}
      {section === "inventory" && (
        <>
          {can("inventory.adjust") && <StockForm id={id} saved={refresh} />}
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
              field("phone"),
              field("address"),
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
        }))}
        keys={["name", "type", "quantity", "balanceAfter", "note"]}
      />
    </>
  );
}
function StockForm({ id, saved }: { id: string; saved: () => void }) {
  const products = useShopLoad<Row[]>(id, "/products");
  const [mode, setMode] = useState("opening-stock");
  return (
    <>
      <label>
        Stock action
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="opening-stock">
            Opening stock (once per product)
          </option>
          <option value="adjustments">Stock adjustment</option>
        </select>
      </label>
      <Notice {...products} />
      {products.data && (
        <RecordProductForm
          key={mode}
          products={products.data}
          fields={[
            field("quantity", true),
            ...(mode === "adjustments"
              ? [
                  field("type", true, [
                    "ADJUSTMENT_IN",
                    "ADJUSTMENT_OUT",
                    "DAMAGE",
                    "EXPIRED",
                    "RETURN_IN",
                    "RETURN_OUT",
                  ]),
                ]
              : []),
            field("note"),
          ]}
          title={
            mode === "opening-stock" ? "Record opening stock" : "Adjust stock"
          }
          save={async (data) => {
            await shopApi(id, `/inventory/${mode}`, {
              method: "POST",
              body: JSON.stringify(data),
            });
            saved();
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
    <>
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
        save={(data) => save({ ...data, productId })}
      />
    </>
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
  const [person, setPerson] = useState("");
  const [lines, setLines] = useState<Row[]>([]);
  const [version, setVersion] = useState(0);
  return (
    <details className="panel">
      <summary>New {sale ? "sale" : "purchase"}</summary>
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
        <p key={String(line.productId)}>
          {String(products.data?.find((p) => p.id === line.productId)?.name)} ·{" "}
          {String(line.quantity)} ×{" "}
          {String(line[sale ? "sellingPrice" : "purchasePrice"])}{" "}
          <button onClick={() => setLines(lines.filter((_, i) => i !== index))}>
            Remove
          </button>
        </p>
      ))}
      <Editor
        key={`transaction-${version}`}
        title="Complete transaction"
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
              items: lines,
            }),
          });
          setLines([]);
          setVersion((v) => v + 1);
          saved();
        }}
      />
    </details>
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
