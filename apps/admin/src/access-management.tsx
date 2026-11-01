import React, { useState } from "react";
import {
  type AccessConfirmation,
  addMemberConfirmation,
  assignableRoles,
  membershipStatusConfirmation,
  ROLE_DESCRIPTIONS,
  roleChangeConfirmation,
  roleDeletion,
  roleDescription,
  roleName,
  type EffectiveAccess,
  type BusinessRoleRecord,
  type MembershipRecord,
  type Permission,
  PERMISSIONS,
} from "@invento/shared";
import { api } from "./api";
import { useLoad, Notice, ConfirmDialog } from "./components";

type Pending = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  run?: () => void;
};

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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BusinessRoleRecord | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  // Role chosen in a member's picker but not saved yet, by user id.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [newRole, setNewRole] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
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
  const roleList = Array.isArray(roles.data) ? roles.data : [];
  const memberList = Array.isArray(members.data) ? members.data : null;
  const choices = assignableRoles(roleList, access);
  const chosenNewRole = choices.some((r) => r.key === newRole)
    ? newRole
    : (choices.find((r) => r.key === "VIEWER") ?? choices[0])?.key ?? "";
  const canManageMember = (member: MembershipRecord) => {
    if (
      member.user.id === access.userId ||
      (member.role === "OWNER" && access.role !== "OWNER")
    )
      return false;
    return !!roleList.find(
      (role) =>
        role.key === member.role && role.permissions.every((p) => can(p)),
    );
  };
  async function write(
    path: string,
    method: string,
    data?: unknown,
    done?: string,
  ) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api(`${base}${path}`, {
        method,
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      setEditing(null);
      setPicked({});
      setRevision((v) => v + 1);
      if (done) setMessage(done);
      refreshAccess();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Runs the change at once, or after the person confirms it.
  function confirmFirst(confirmation: AccessConfirmation | null, run: () => void) {
    if (confirmation) setPending({ ...confirmation, run });
    else run();
  }
  const memberPath = (m: MembershipRecord) =>
    `/members/${encodeURIComponent(m.user.id)}`;
  return (
    <>
      <h2>Users, roles and permissions</h2>
      <p className="muted">
        Changes apply to the same account on web and mobile. Your role:{" "}
        {roleName(roleList, access.role)}.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {pending && (
        <ConfirmDialog
          {...pending}
          onClose={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            pending.run?.();
          }}
        />
      )}
      {can("members.view") && (
        <section className="panel access-panel">
          <h2>Shop memberships</h2>
          <Notice {...members} />
          {memberList?.map((m) => {
            const choice = picked[m.user.id] ?? m.role;
            const choiceRole = roleList.find((r) => r.key === choice);
            return (
              <div key={m.id} className="access-member">
                <div>
                  <strong>{m.user.name}</strong>
                  <p>
                    {m.user.email} · {m.isActive ? "Active" : "Inactive"}
                    {!m.user.isActive ? " · Account suspended" : ""}
                  </p>
                </div>
                {canManageMember(m) && can("members.update") && roleList.length ? (
                  <div className="role-picker">
                    <select
                      aria-label={`Role for ${m.user.name}`}
                      aria-describedby={`role-help-${m.id}`}
                      disabled={busy}
                      value={choice}
                      onChange={(e) =>
                        setPicked({ ...picked, [m.user.id]: e.target.value })
                      }
                    >
                      {choices.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                          {r.key === m.role ? " (current)" : ""}
                        </option>
                      ))}
                    </select>
                    <small id={`role-help-${m.id}`} className="muted">
                      {choiceRole ? roleDescription(choiceRole) : ""}
                    </small>
                    {choice !== m.role && (
                      <span className="actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            confirmFirst(
                              roleChangeConfirmation(m, choice, roleList),
                              () =>
                                void write(
                                  memberPath(m),
                                  "PATCH",
                                  { role: choice },
                                  `${m.user.name} is now ${roleName(roleList, choice)}.`,
                                ),
                            )
                          }
                        >
                          Change role
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const rest = { ...picked };
                            delete rest[m.user.id];
                            setPicked(rest);
                          }}
                        >
                          Keep {roleName(roleList, m.role)}
                        </button>
                      </span>
                    )}
                  </div>
                ) : (
                  <span>{roleName(roleList, m.role)}</span>
                )}
                {m.user.id !== access.userId &&
                  (m.role !== "OWNER" || access.role === "OWNER") &&
                  can("members.update") &&
                  (!m.isActive || can("members.remove")) && (
                    <button
                      className={m.isActive ? "danger" : ""}
                      aria-label={`${m.isActive ? "Deactivate" : "Reactivate"} membership of ${m.user.name}`}
                      disabled={busy || (!m.isActive && !m.user.isActive)}
                      onClick={() =>
                        confirmFirst(membershipStatusConfirmation(m), () =>
                          void write(
                            memberPath(m),
                            "PATCH",
                            { isActive: !m.isActive },
                            `${m.user.name}'s membership is ${m.isActive ? "deactivated" : "active again"}.`,
                          ),
                        )
                      }
                    >
                      {m.isActive
                        ? "Deactivate membership"
                        : "Reactivate membership"}
                    </button>
                  )}
              </div>
            );
          })}
        </section>
      )}
      {can("members.invite") && can("roles.view") && (
        <form
          className="panel access-panel shop-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const email = String(new FormData(e.currentTarget).get("email") ?? "");
            const form = e.currentTarget;
            confirmFirst(addMemberConfirmation(email, chosenNewRole), () =>
              void write(
                "/members",
                "POST",
                { email, role: chosenNewRole },
                `${email.trim()} was added as ${roleName(roleList, chosenNewRole)}.`,
              ).then((saved) => saved && form.reset()),
            );
          }}
        >
          <h2>Add existing account</h2>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select
              name="role"
              aria-describedby="new-member-role-help"
              value={chosenNewRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              {choices.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
            <small id="new-member-role-help" className="muted">
              {(() => {
                const role = roleList.find((r) => r.key === chosenNewRole);
                return role ? roleDescription(role) : "";
              })()}
            </small>
          </label>
          <button disabled={busy || !roleList.length}>Add to shop</button>
        </form>
      )}
      {can("roles.view") && (
        <section className="panel access-panel">
          <h2>Business roles</h2>
          <Notice {...roles} />
          {roleList.map((r) => (
              <div key={r.key} className="access-member">
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    {roleDescription(r)}
                    {ROLE_DESCRIPTIONS[r.key]
                      ? ` · ${r.permissions.length} permissions`
                      : ""}
                  </p>
                </div>
                {can("roles.manage") &&
                  r.key !== "OWNER" &&
                  r.key !== access.role && (
                    <>
                      <button
                        disabled={busy}
                        aria-label={`Configure the ${r.name} role`}
                        onClick={() => {
                          setEditing(r);
                          setPermissions([...r.permissions]);
                        }}
                      >
                        Configure
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        aria-label={`Delete the ${r.name} role`}
                        onClick={() => {
                          const check = roleDeletion(r, memberList);
                          if ("blocked" in check)
                            setPending({
                              title: `The ${r.name} role is still in use`,
                              message: check.blocked,
                            });
                          else
                            confirmFirst(check.confirm, () =>
                              void write(
                                `/roles/${encodeURIComponent(r.key)}`,
                                "DELETE",
                                undefined,
                                `The ${r.name} role was deleted.`,
                              ),
                            );
                        }}
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
