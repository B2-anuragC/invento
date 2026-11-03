import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { login, logout, setSessionExpired, type PanelAccess } from "./api";
import { label } from "./components";
import { Overview, Directory, Detail, Audit } from "./pages";
import { ShopWorkspace } from "./shop";
import { platformPageTitle, signedOutPageTitle } from "./page-title";
import { AuthLayout, RegisterPage, ShopSetupPage } from "./onboarding";
import { entryRoute, guardRoute } from "./registration";
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
  // The page actually shown: signed-out visitors, members without a shop and
  // platform admins are redirected (see registration.ts).
  const shown = guardRoute(route, access);
  useEffect(() => {
    if (access && shown !== route) location.replace(`#${shown}`);
  }, [access, shown, route]);
  // Shop workspace pages set their own title (see ShopWorkspace).
  const [, routeSection, routeId] = shown.split("/");
  const inShop =
    !!access &&
    shown !== "/setup" &&
    (!access.isPlatformAdmin ||
      routeSection === "shops" ||
      (routeSection === "businesses" && !!routeId));
  useEffect(() => {
    if (!inShop)
      document.title = access
        ? platformPageTitle(shown)
        : signedOutPageTitle(route);
  }, [access, route, shown, inShop]);
  const signOut = async () => {
    await logout();
    setAccess(null);
  };
  if (!access && shown === "/register")
    return (
      <RegisterPage
        onRegistered={(panel) => {
          setError("");
          setAccess(panel);
          location.hash = entryRoute(panel);
        }}
      />
    );
  if (!access)
    return (
      <AuthLayout>
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
              location.hash = entryRoute(panel);
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
            {busy ? "Signing in…" : "Sign in"}
            {!busy && <span aria-hidden> →</span>}
          </button>
        </form>
        <p className="form-switch">
          New to Invento? <a href="#/register">Create an account</a>
        </p>
        <p className="muted fine">
          Business members can manage their own shops. Platform administrators
          can manage all shops.
        </p>
      </AuthLayout>
    );
  if (shown === "/setup")
    return (
      <ShopSetupPage
        shops={access.shops}
        onSignOut={signOut}
        onCreated={(shopId, panel) => {
          setAccess(panel);
          location.hash = `/shops/${shopId}`;
        }}
      />
    );
  const [, section, id, shopSection] = shown.split("/");
  const activeSection =
    access.isPlatformAdmin && section === "shops" ? "businesses" : section;
  return (
    <div className="shell">
      <aside>
        <a href="#/overview" className="brand">
          <span className="brand-icon" aria-hidden>
            i
          </span>{" "}
          invento
        </a>
        <p className="sidebar-label">
          {access.isPlatformAdmin ? "PLATFORM ADMIN" : "BUSINESS WORKSPACE"}
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
              className={activeSection === name ? "selected" : ""}
              aria-current={activeSection === name ? "page" : undefined}
              href={`#/${name}`}
              key={name}
            >
              <span aria-hidden>{icon}</span>
              {name === "audit-logs"
                ? "Audit log"
                : name === "shops"
                  ? "Businesses"
                  : label(name)}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="dot" /> Connected to Invento
          <button onClick={signOut}>Sign out</button>
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
            {access.isPlatformAdmin
              ? "Platform administrator"
              : "Business member"}
          </span>
        </header>
        <div className="page">
          {!access.isPlatformAdmin ||
          section === "shops" ||
          (section === "businesses" && !!id) ? (
            <ShopWorkspace
              key={`${id || "owner"}/${shopSection || "overview"}`}
              shops={access.shops}
              platform={access.isPlatformAdmin}
              requestedId={id}
              initialSection={shopSection}
            />
          ) : section === "roles" ? (
            <Directory kind="businesses" />
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
