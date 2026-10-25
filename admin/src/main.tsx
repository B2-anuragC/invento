import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { login, logout, setSessionExpired, type PanelAccess } from "./api";
import { label } from "./components";
import { Overview, Directory, Detail, Audit } from "./pages";
import { ShopWorkspace } from "./shop";
import "./style.css";

function App() {
  const [access, setAccess] = useState<PanelAccess | null>(null);
  const [route, setRoute] = useState(location.hash.slice(1) || "/overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const handler = () => setRoute(location.hash.slice(1) || "/overview");
    window.addEventListener("hashchange", handler);
    setSessionExpired(() => {
      setAccess(null);
      setError("Session expired. Please sign in again.");
    });
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  if (!access)
    return (
      <main className="login">
        <section className="login-brand">
          <div className="brand">
            <span className="brand-icon">i</span> invento
            <span className="brand-sub">PLATFORM</span>
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
        <section className="login-form">
          <p className="eyebrow">SHOP & PLATFORM ADMINISTRATION</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your authorized Invento account.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const panel = await login(
                  String(values.get("email")),
                  String(values.get("password")),
                );
                setAccess(panel);
                location.hash = panel.isPlatformAdmin ? "/overview" : "/shops";
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                autoComplete="username"
                name="email"
                type="email"
                required
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                name="password"
                type="password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </form>
          <p className="muted fine">
            Shop owners can manage their own shops. Platform administrators can
            manage all shops.
          </p>
        </section>
      </main>
    );
  const [, section, id] = route.split("/");
  return (
    <div className="shell">
      <aside>
        <a href="#/overview" className="brand">
          <span className="brand-icon">i</span> invento
        </a>
        <p className="sidebar-label">
          {access.isPlatformAdmin ? "PLATFORM ADMIN" : "SHOP OWNER"}
        </p>
        <nav>
          {(access.isPlatformAdmin
            ? [
                ["overview", "◈"],
                ["businesses", "▦"],
                ["users", "◉"],
                ["audit-logs", "≡"],
              ]
            : [["shops", "▦"]]
          ).map(([name, icon]) => (
            <a
              className={section === name ? "selected" : ""}
              href={`#/${name}`}
              key={name}
            >
              <span aria-hidden>{icon}</span>
              {name === "audit-logs" ? "Audit log" : label(name)}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="dot" /> Connected to Invento
          <button
            onClick={async () => {
              await logout();
              setAccess(null);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <span>
            Invento /{" "}
            {access.isPlatformAdmin
              ? "Platform administration"
              : "Shop management"}
          </span>
          <span className="admin-tag">
            {access.isPlatformAdmin ? "Platform administrator" : "Shop owner"}
          </span>
        </header>
        <div className="page">
          {!access.isPlatformAdmin || section === "shops" ? (
            <ShopWorkspace
              key={id || "owner"}
              shops={access.shops}
              platform={access.isPlatformAdmin}
              requestedId={id}
            />
          ) : section === "overview" ? (
            <Overview />
          ) : section === "businesses" || section === "users" ? (
            id ? (
              <Detail key={`${section}/${id}`} kind={section} id={id} />
            ) : (
              <Directory key={section} kind={section} />
            )
          ) : section === "audit-logs" ? (
            <Audit />
          ) : (
            <p>
              Page not found. <a href="#/overview">Return to overview</a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
