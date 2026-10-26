import React, { useState } from "react";
import {
  type EffectiveAccess,
  type BusinessRoleRecord,
  type MembershipRecord,
  type Permission,
  PERMISSIONS,
} from "@invento/shared";
import { api } from "./api";
import { useLoad, Notice } from "./components";

export function AccessManagement({
  id,
  access,
  refreshAccess,
}: {
  id: string;
  access: EffectiveAccess;
  refreshAccess: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BusinessRoleRecord | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const base = `/businesses/${encodeURIComponent(id)}/access`;
  const can = (p: Permission) => access.permissions.includes(p);
  const roles = useLoad<BusinessRoleRecord[]>(
    `${base}/${can("roles.view") ? "roles" : "me"}`,
    revision,
  );
  const members = useLoad<MembershipRecord[]>(
    `${base}/${can("members.view") ? "members" : "me"}`,
    revision,
  );
  const canManageMember = (member: MembershipRecord) => {
    if (
      member.user.id === access.userId ||
      (member.role === "OWNER" && access.role !== "OWNER")
    )
      return false;
    return (
      Array.isArray(roles.data) &&
      !!roles.data.find(
        (role) =>
          role.key === member.role && role.permissions.every((p) => can(p)),
      )
    );
  };
  async function write(path: string, method: string, data?: unknown) {
    setError("");
    setBusy(true);
    try {
      await api(`${base}${path}`, {
        method,
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      setEditing(null);
      setRevision((v) => v + 1);
      refreshAccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Users, roles and permissions</h2>
      <p className="muted">
        Changes apply to the same account on web and mobile. Your role:{" "}
        {access.role}.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {can("members.view") && (
        <section className="panel access-panel">
          <h2>Shop memberships</h2>
          <Notice {...members} />
          {Array.isArray(members.data) &&
            members.data.map((m) => (
              <div key={m.id} className="access-member">
                <div>
                  <strong>{m.user.name}</strong>
                  <p>
                    {m.user.email} · {m.isActive ? "Active" : "Inactive"}
                    {!m.user.isActive ? " · Account suspended" : ""}
                  </p>
                </div>
                {canManageMember(m) &&
                can("members.update") &&
                Array.isArray(roles.data) ? (
                  <select
                    aria-label={`Role for ${m.user.name}`}
                    disabled={busy}
                    value={m.role}
                    onChange={(e) =>
                      void write(
                        `/members/${encodeURIComponent(m.user.id)}`,
                        "PATCH",
                        { role: e.target.value },
                      )
                    }
                  >
                    {roles.data
                      .filter(
                        (r) =>
                          (r.key !== "OWNER" || access.role === "OWNER") &&
                          r.permissions.every((p) => can(p)),
                      )
                      .map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span>{m.role}</span>
                )}
                {m.user.id !== access.userId &&
                  (m.role !== "OWNER" || access.role === "OWNER") &&
                  can("members.update") &&
                  (!m.isActive || can("members.remove")) && (
                    <button
                      disabled={busy || (!m.isActive && !m.user.isActive)}
                      onClick={() =>
                        void write(
                          `/members/${encodeURIComponent(m.user.id)}`,
                          "PATCH",
                          { isActive: !m.isActive },
                        )
                      }
                    >
                      {m.isActive
                        ? "Deactivate membership"
                        : "Reactivate membership"}
                    </button>
                  )}
              </div>
            ))}
        </section>
      )}
      {can("members.invite") && can("roles.view") && (
        <form
          className="panel access-panel shop-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void write("/members", "POST", {
              email: d.get("email"),
              role: d.get("role"),
            });
          }}
        >
          <h2>Add existing account</h2>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role">
              {Array.isArray(roles.data) &&
                roles.data
                  .filter(
                    (r) =>
                      (r.key !== "OWNER" || access.role === "OWNER") &&
                      r.permissions.every((p) => can(p)),
                  )
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
            </select>
          </label>
          <button disabled={busy || !Array.isArray(roles.data)}>
            Add to shop
          </button>
        </form>
      )}
      {can("roles.view") && (
        <section className="panel access-panel">
          <h2>Business roles</h2>
          <Notice {...roles} />
          {Array.isArray(roles.data) &&
            roles.data.map((r) => (
              <div key={r.key} className="access-member">
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    {r.permissions.length} permissions · {r.key}
                  </p>
                </div>
                {can("roles.manage") &&
                  r.key !== "OWNER" &&
                  r.key !== access.role && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(r);
                          setPermissions([...r.permissions]);
                        }}
                      >
                        Configure
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void write(
                            `/roles/${encodeURIComponent(r.key)}`,
                            "DELETE",
                          )
                        }
                      >
                        Delete role
                      </button>
                    </>
                  )}
              </div>
            ))}
          {can("roles.manage") && (
            <button
              onClick={() => {
                setEditing({
                  key: "",
                  name: "",
                  permissions: [],
                  isSystem: false,
                });
                setPermissions([]);
              }}
            >
              Create custom role
            </button>
          )}
        </section>
      )}
      {editing &&
        can("roles.manage") &&
        editing.key !== "OWNER" &&
        editing.key !== access?.role && (
          <form
            className="panel access-panel role-editor"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void write(
                editing.key
                  ? `/roles/${encodeURIComponent(editing.key)}`
                  : "/roles",
                editing.key ? "PATCH" : "POST",
                {
                  ...(!editing.key
                    ? { key: String(data.get("key")).toUpperCase() }
                    : {}),
                  name: data.get("name"),
                  permissions,
                },
              );
            }}
          >
            <h2>{editing.key ? "Configure role" : "New custom role"}</h2>
            {!editing.key && (
              <label>
                Role key
                <input
                  name="key"
                  required
                  pattern="[A-Za-z][A-Za-z0-9_]{1,49}"
                  maxLength={50}
                />
              </label>
            )}
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={editing.name}
              />
            </label>
            <div className="permission-grid">
              {PERMISSIONS.map((p) => (
                <label key={p} className="checkbox">
                  <input
                    type="checkbox"
                    disabled={!can(p)}
                    checked={permissions.includes(p)}
                    onChange={(e) =>
                      setPermissions(
                        e.target.checked
                          ? [...permissions, p]
                          : permissions.filter((x) => x !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <button className="primary" disabled={busy}>
              Save role
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        )}
      {can("audit.view") && <BusinessAudit key={revision} base={base} />}
    </>
  );
}
function BusinessAudit({ base }: { base: string }) {
  const result = useLoad<
    {
      id: string;
      action: string;
      actorId: string;
      targetId: string;
      createdAt: string;
    }[]
  >(`${base}/audit`);
  return (
    <section className="panel access-panel access-audit">
      <h2>Recent access changes</h2>
      <Notice {...result} />
      {result.data?.map((r) => (
        <p key={r.id}>
          {new Date(r.createdAt).toLocaleString()} · {r.action} · Actor{" "}
          {r.actorId} · Target {r.targetId}
        </p>
      ))}
    </section>
  );
}
