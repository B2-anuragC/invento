import React, { useState } from "react";
import { api, type PanelAccess } from "./api";
import { display, label, Notice, useLoad, type Row } from "./components";

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
}: {
  shops: PanelAccess["shops"];
  platform: boolean;
  requestedId?: string;
}) {
  // Owner routes never accept an arbitrary shop ID. The API also checks membership.
  const [selected, setSelected] = useState(shops[0]?.id || "");
  const id = platform ? requestedId || selected : selected;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SHOP MANAGEMENT</p>
          <h1>{platform ? "Manage shop" : "Your shops"}</h1>
          <p className="muted">
            Products, stock, people, and daily operations for the selected shop.
          </p>
        </div>
        {shops.length > 0 && (
          <label>
            Active shop
            <select
              value={id}
              onChange={(e) => {
                setSelected(e.target.value);
                if (platform)
                  location.hash = `/shops/${encodeURIComponent(e.target.value)}`;
              }}
            >
              {platform && id && !shops.some((s) => s.id === id) && (
                <option value={id}>Selected shop</option>
              )}
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!id ? (
        <p>
          Select a business from the{" "}
          <a href="#/businesses">business directory</a> to manage its shop.
        </p>
      ) : (
        <Shop key={id} id={id} />
      )}
    </>
  );
}

function Shop({ id }: { id: string }) {
  const access = useLoad<Row>(`/businesses/${encodeURIComponent(id)}`);
  const [section, setSection] = useState("overview");
  return (
    <>
      <Notice {...access} />
      {access.data && (
        <>
          <h2>{String(access.data.name)}</h2>
          <div className="tabs" role="tablist">
            {sections.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={section === s}
                onClick={() => setSection(s)}
              >
                {label(s)}
              </button>
            ))}
          </div>
          <ShopSection key={section} id={id} section={section} />
        </>
      )}
    </>
  );
}

function ShopSection({ id, section }: { id: string; section: string }) {
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
  const fields = section === "products" ? productFields : personFields;
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
          <button onClick={() => setEditing({})}>
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
                  ? [...fields, field("status", true, ["ACTIVE", "INACTIVE"])]
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
            edit={setEditing}
          />
          <details className="panel">
            <summary>Inactive records</summary>
            <Inactive
              id={id}
              section={section}
              edit={setEditing}
              revision={revision}
            />
          </details>
        </>
      )}
      {["sales", "purchases"].includes(section) && (
        <>
          <TransactionForm id={id} section={section} saved={refresh} />
          <Records
            rows={rows}
            keys={[
              "invoiceNumber",
              section === "sales" ? "saleDate" : "purchaseDate",
              "total",
              "status",
              "note",
            ]}
            edit={setEditing}
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
          <StockForm id={id} saved={refresh} />
          <Records
            rows={rows.map((r) => ({ ...r, name: (r.product as Row)?.name }))}
            keys={["name", "quantity", "updatedAt"]}
          />
          <Activity id={id} revision={revision} />
        </>
      )}
      {section === "team" && <Team id={id} rows={rows} saved={refresh} />}
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
          <Pricing id={id} />
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
  edit: (r: Row) => void;
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
function Team({
  id,
  rows,
  saved,
}: {
  id: string;
  rows: Row[];
  saved: () => void;
}) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const base = `/businesses/${encodeURIComponent(id)}/users`;
  return (
    <>
      <Editor
        title="Add existing account to shop"
        fields={[
          { key: "email", type: "email", required: true },
          field("role", true, ["MEMBER", "ADMIN"]),
        ]}
        save={async (data) => {
          await api(base, { method: "POST", body: JSON.stringify(data) });
          saved();
        }}
      />
      <Records
        rows={rows.map((r) => ({
          ...r,
          name: (r.user as Row).name,
          email: (r.user as Row).email,
        }))}
        keys={["name", "email", "role"]}
        edit={setEditing}
      />
      {editing && editing.role !== "OWNER" && (
        <>
          <Editor
            key={String(editing.id)}
            title="Change shop role"
            fields={[field("role", true, ["MEMBER", "ADMIN"])]}
            initial={editing}
            cancel={() => setEditing(null)}
            save={async (data) => {
              await api(
                `${base}/${encodeURIComponent(String((editing.user as Row).id))}`,
                { method: "PATCH", body: JSON.stringify(data) },
              );
              setEditing(null);
              saved();
            }}
          />
          <button
            className="danger"
            onClick={async () => {
              setError("");
              try {
                await api(
                  `${base}/${encodeURIComponent(String((editing.user as Row).id))}`,
                  { method: "DELETE" },
                );
                setEditing(null);
                saved();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Remove from this shop
          </button>
        </>
      )}
      {editing?.role === "OWNER" && (
        <p>
          Owner memberships are protected.{" "}
          <button onClick={() => setEditing(null)}>Close</button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
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
