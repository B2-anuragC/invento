import { useState, type ReactNode } from "react";
import {
  canCreateShop,
  PASSWORD_RULE_HINT,
  registerError,
  SHOP_ID_MAX,
  SHOP_NAME_MAX,
  shopIdFrom,
} from "@invento/shared";
import { createShop, register, type PanelAccess } from "./api";
import { nextShopId } from "./registration";

/** The two-column page shared by sign-in, create account and shop setup. */
export function AuthLayout({
  children,
  label = "PLATFORM",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand">
          <span className="brand-icon" aria-hidden>
            i
          </span>{" "}
          invento
          <span className="brand-sub">{label}</span>
        </div>
        <h1>
          Your shops.
          <br />
          One clear view.
        </h1>
        <p>
          Manage your shop, support your team, and keep every action
          accountable.
        </p>
      </section>
      <section className="login-form">{children}</section>
    </main>
  );
}

// Same fields, messages and order as the phone's Create account screen.
export function RegisterPage({
  onRegistered,
}: {
  onRegistered: (access: PanelAccess) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout>
      <p className="eyebrow">CREATE ACCOUNT</p>
      <h2>Create your account</h2>
      <p className="muted">
        Set up your account first. You can add your shop next.
      </p>
      {/* Checked on submit, not by disabling the button, so autofill works. */}
      <form
        noValidate
        onChange={() => error && setError("")}
        onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const input = {
            name: String(values.get("name") ?? ""),
            email: String(values.get("email") ?? ""),
            password: String(values.get("password") ?? ""),
          };
          const problem = registerError(input);
          if (problem) return setError(problem);
          setBusy(true);
          setError("");
          try {
            onRegistered(await register(input));
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          Your name
          <input name="name" autoComplete="name" maxLength={100} />
        </label>
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="form-hint">
            {PASSWORD_RULE_HINT}
          </span>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="form-switch">
        Already have an account? <a href="#/login">Sign in</a>
      </p>
    </AuthLayout>
  );
}

// Same as the phone's Choose your shop screen, without guest mode.
export function ShopSetupPage({
  shops,
  onCreated,
  onSignOut,
}: {
  shops: PanelAccess["shops"];
  onCreated: (shopId: string, access: PanelAccess) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState({ shopId: "", edited: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = canCreateShop({ name, shopId: shopIdFrom(shopId.shopId) });
  return (
    <AuthLayout label="SHOP SETUP">
      <div className="setup-heading">
        <p className="eyebrow">YOUR SHOPS</p>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <h2>{shops.length ? "Choose your shop" : "Create your shop"}</h2>
      <p className="muted">
        Business data stays separate for each shop you belong to.
      </p>
      {shops.length ? (
        <ul className="setup-shops" aria-label="Your businesses">
          {shops.map((shop) => (
            <li key={shop.id}>
              <a href={`#/shops/${shop.id}`}>
                <span className="setup-initial" aria-hidden>
                  {shop.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {shop.name}
                  <small>{shop.slug}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No business is linked to this account yet.</p>
      )}
      <form
        noValidate
        aria-labelledby="create-business"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || busy) return;
          setBusy(true);
          setError("");
          try {
            const created = await createShop({ name, slug: shopId.shopId });
            onCreated(created.shop.id, created.access);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div>
          <h3 id="create-business">Create a business</h3>
          <p className="form-hint">
            Use your shop name. You can update the details later.
          </p>
        </div>
        <label>
          Business name
          <input
            name="name"
            value={name}
            maxLength={SHOP_NAME_MAX}
            placeholder="e.g. Shree Aluminium & Hardware"
            onChange={(e) => {
              setName(e.target.value);
              setShopId((state) => nextShopId(state, { name: e.target.value }));
              setError("");
            }}
          />
        </label>
        <label>
          Unique shop ID
          <input
            name="slug"
            value={shopId.shopId}
            maxLength={SHOP_ID_MAX}
            placeholder="shree-aluminium"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => {
              setShopId((state) =>
                nextShopId(state, { shopId: e.target.value }),
              );
              setError("");
            }}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !ready}>
          {busy ? "Creating…" : "Create shop"}
        </button>
      </form>
    </AuthLayout>
  );
}
