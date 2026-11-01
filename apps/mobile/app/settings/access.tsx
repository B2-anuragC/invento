import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  type AccessConfirmation,
  addMemberConfirmation,
  assignableRoles,
  membershipStatusConfirmation,
  roleChangeConfirmation,
  roleDeletion,
  roleDescription,
  roleName,
  PERMISSIONS,
  type BusinessRoleRecord,
  type MembershipRecord,
  type Permission,
} from "@invento/shared";
import { AppScreen, ActionButton, ConfirmationDialog } from "@/components/invento-ui";
import { ScreenHeading } from "@/components/screen-heading";
import { accessRequest, appSession } from "@/services/api";
import { usePermissions } from "@/services/permissions";

export default function BusinessAccessScreen() {
  const { access, can, refresh } = usePermissions();
  const [roles, setRoles] = useState<BusinessRoleRecord[]>([]);
  const [members, setMembers] = useState<MembershipRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("VIEWER");
  // The member whose role picker is open, and the role picked there.
  const [picking, setPicking] = useState<{ userId: string; role: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<
    (Partial<AccessConfirmation> & { title: string; message: string; run?: () => void }) | null
  >(null);
  const [editing, setEditing] = useState<BusinessRoleRecord | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [audit, setAudit] = useState<
    { id: string; action: string; actorId: string; createdAt: string }[]
  >([]);
  useEffect(() => {
    let current = true;
    setRoles([]);
    setMembers([]);
    setAudit([]);
    const load = async () => {
      try {
        const [r, m, a] = await Promise.all([
          can("roles.view") ? accessRequest<BusinessRoleRecord[]>("roles") : [],
          can("members.view")
            ? accessRequest<MembershipRecord[]>("members")
            : [],
          can("audit.view") ? accessRequest<typeof audit>("audit") : [],
        ]);
        if (current) {
          setRoles(r);
          setMembers(m);
          setAudit(a);
        }
      } catch (e) {
        if (current) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [access, revision, can]);
  async function write(path: string, method: string, data?: unknown, done = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await accessRequest(path, {
        method,
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      setEditing(null);
      setPicking(null);
      setRevision((v) => v + 1);
      setNotice(done);
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Runs the change at once, or after the person confirms it.
  const confirmFirst = (confirmation: AccessConfirmation | null, run: () => void) => {
    if (confirmation) setPending({ ...confirmation, run });
    else run();
  };
  const choices = access ? assignableRoles(roles, access) : [];
  const canManage = (m: MembershipRecord) =>
    m.user.id !== appSession.current?.user.id &&
    can("members.update") &&
    (m.role !== "OWNER" || access?.role === "OWNER");
  // One role in a picker: its name and what it can do, read out as a radio button.
  const roleOption = (r: BusinessRoleRecord, checked: boolean, onPress: () => void, current = false) => (
    <Pressable
      key={r.key}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled: busy }}
      accessibilityLabel={`${r.name}${current ? ", current role" : ""}. ${roleDescription(r)}`}
      disabled={busy}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        padding: 12,
        borderWidth: 1,
        borderColor: checked ? "#176b58" : "#ccd9d4",
        backgroundColor: checked ? "#e0f1e8" : "white",
        borderRadius: 8,
        marginVertical: 4,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: checked ? "#176b58" : "#8a9a93",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#176b58" }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "700" }}>
          {r.name}
          {current ? " (current)" : ""}
        </Text>
        <Text style={{ color: "#53625b" }}>{roleDescription(r)}</Text>
      </View>
    </Pressable>
  );
  const button = (text: string, action: () => void, selected = false, label?: string) => (
    <Pressable
      key={text}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={action}
      style={{
        padding: 12,
        borderWidth: 1,
        borderColor: selected ? "#176b58" : "#ccd9d4",
        backgroundColor: selected ? "#e0f1e8" : "white",
        borderRadius: 8,
        marginVertical: 4,
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
  const inputStyle = {
    borderWidth: 1,
    borderColor: "#ccd9d4",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "white",
  };
  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeading title="Team and roles" subtitle="Who can use this shop and what they can do" />
        <Text>
          Selected business · {appSession.current?.businessName}. Your role:{" "}
          {access ? roleName(roles, access.role) : ""}. Changes apply on web and mobile.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={{ color: "#a13e37" }}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={{ color: "#176b58", fontWeight: "600" }}>
            {notice}
          </Text>
        ) : null}
        {can("members.view") && (
          <>
            <Text style={{ fontSize: 20, fontWeight: "600" }}>Memberships</Text>
            {members.map((m) => (
              <View
                key={m.id}
                style={{
                  padding: 16,
                  backgroundColor: "white",
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontWeight: "700" }}>{m.user.name}</Text>
                <Text>{m.user.email}</Text>
                <Text>
                  {roleName(roles, m.role)} · {m.isActive ? "Active" : "Inactive"}
                  {!m.user.isActive ? " · Account suspended" : ""}
                </Text>
                {canManage(m) && (
                  <>
                    {can("roles.view") && picking?.userId !== m.user.id &&
                      button("Change role", () => setPicking({ userId: m.user.id, role: m.role }), false, `Change role for ${m.user.name}`)}
                    {can("roles.view") && picking?.userId === m.user.id && (
                      <View accessibilityRole="radiogroup" accessibilityLabel={`Role for ${m.user.name}`}>
                        <Text style={{ fontWeight: "600", marginTop: 8 }}>Choose a role for {m.user.name}</Text>
                        {choices.map((r) =>
                          roleOption(r, picking.role === r.key, () => setPicking({ userId: m.user.id, role: r.key }), r.key === m.role),
                        )}
                        <ActionButton
                          title={busy ? "Saving…" : "Save role"}
                          disabled={busy || picking.role === m.role}
                          onPress={() => {
                            const next = picking.role;
                            confirmFirst(roleChangeConfirmation(m, next, roles), () =>
                              void write(
                                `members/${encodeURIComponent(m.user.id)}`,
                                "PATCH",
                                { role: next },
                                `${m.user.name} is now ${roleName(roles, next)}.`,
                              ),
                            );
                          }}
                        />
                        {button("Cancel", () => setPicking(null), false, `Keep ${m.user.name}'s role`)}
                      </View>
                    )}
                    {(!m.isActive || can("members.remove")) &&
                      button(
                        m.isActive ? `Deactivate membership` : `Reactivate membership`,
                        () =>
                          confirmFirst(membershipStatusConfirmation(m), () =>
                            void write(
                              `members/${encodeURIComponent(m.user.id)}`,
                              "PATCH",
                              { isActive: !m.isActive },
                              `${m.user.name}'s membership is ${m.isActive ? "deactivated" : "active again"}.`,
                            ),
                          ),
                        false,
                        `${m.isActive ? "Deactivate" : "Reactivate"} membership of ${m.user.name}`,
                      )}
                  </>
                )}
              </View>
            ))}
          </>
        )}
        {can("members.invite") && can("roles.view") && (
          <>
            <Text style={{ fontSize: 20 }}>Add existing account</Text>
            <TextInput
              accessibilityLabel="Member email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              style={inputStyle}
            />
            <View accessibilityRole="radiogroup" accessibilityLabel="Role for the new member">
              <Text style={{ fontWeight: "600" }}>Role</Text>
              {choices.map((r) => roleOption(r, selectedRole === r.key, () => setSelectedRole(r.key)))}
            </View>
            <ActionButton
              title={busy ? "Saving…" : "Add member"}
              disabled={busy}
              onPress={() => {
                const added = email.trim();
                confirmFirst(addMemberConfirmation(added, selectedRole), () =>
                  void write("members", "POST", { email: added, role: selectedRole }, `${added} was added as ${roleName(roles, selectedRole)}.`).then((saved) => { if (saved) setEmail(""); }),
                );
              }}
            />
          </>
        )}
        {can("roles.view") && (
          <>
            <Text style={{ fontSize: 20, fontWeight: "600" }}>Roles</Text>
            {roles.map((r) => (
              <View key={r.key}>
                <Text style={{ fontWeight: "700" }}>{r.name}</Text>
                <Text>
                  {roleDescription(r)}
                  {r.isSystem ? ` · ${r.permissions.length} permissions` : ""}
                </Text>
                {can("roles.manage") &&
                  r.key !== "OWNER" &&
                  r.key !== access?.role && (
                    <>
                      {button(`Configure ${r.name}`, () => {
                        setEditing(r);
                        setKey(r.key);
                        setName(r.name);
                        setPermissions([...r.permissions]);
                      })}
                      {button(`Delete ${r.name}`, () => {
                        const check = roleDeletion(r, can("members.view") ? members : null);
                        if ("blocked" in check)
                          setPending({ title: `The ${r.name} role is still in use`, message: check.blocked });
                        else
                          confirmFirst(check.confirm, () =>
                            void write(`roles/${encodeURIComponent(r.key)}`, "DELETE", undefined, `The ${r.name} role was deleted.`),
                          );
                      }, false, `Delete the ${r.name} role`)}
                    </>
                  )}
              </View>
            ))}
          </>
        )}
        {can("roles.manage") &&
          button("Create custom role", () => {
            setEditing({ key: "", name: "", permissions: [], isSystem: false });
            setKey("");
            setName("");
            setPermissions([]);
          })}
        {editing &&
          can("roles.manage") &&
          editing.key !== "OWNER" &&
          editing.key !== access?.role && (
            <>
              <Text style={{ fontSize: 20 }}>Configure role</Text>
              {!editing.key && (
                <TextInput
                  accessibilityLabel="Role key"
                  value={key}
                  onChangeText={(v) => setKey(v.toUpperCase())}
                  placeholder="CUSTOM_ROLE"
                  style={inputStyle}
                />
              )}
              <TextInput
                accessibilityLabel="Role name"
                value={name}
                onChangeText={setName}
                placeholder="Role name"
                style={inputStyle}
              />
              {PERMISSIONS.filter((p) => can(p)).map((p) => (
                <Pressable
                  key={p}
                  accessibilityRole="checkbox"
                  accessibilityLabel={p}
                  accessibilityState={{ checked: permissions.includes(p), disabled: busy }}
                  disabled={busy}
                  onPress={() =>
                    setPermissions(
                      permissions.includes(p)
                        ? permissions.filter((v) => v !== p)
                        : [...permissions, p],
                    )
                  }
                  style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderWidth: 1, borderColor: "#ccd9d4", backgroundColor: "white", borderRadius: 8, marginVertical: 4 }}
                >
                  <View
                    style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: permissions.includes(p) ? "#176b58" : "#8a9a93", backgroundColor: permissions.includes(p) ? "#176b58" : "white" }}
                  />
                  <Text>{p}</Text>
                </Pressable>
              ))}
              <ActionButton
                title="Save role"
                onPress={() => {
                  if (!busy)
                    void write(
                      editing.key
                        ? `roles/${encodeURIComponent(editing.key)}`
                        : "roles",
                      editing.key ? "PATCH" : "POST",
                      { ...(!editing.key ? { key } : {}), name, permissions },
                    );
                }}
              />
              {button("Cancel role editing", () => setEditing(null))}
            </>
          )}
        {can("audit.view") && (
          <>
            <Text style={{ fontSize: 20 }}>Recent access changes</Text>
            {audit.map((a) => (
              <Text key={a.id}>
                {a.createdAt} · {a.action} · {a.actorId}
              </Text>
            ))}
          </>
        )}
      </ScrollView>
      <ConfirmationDialog
        visible={!!pending}
        title={pending?.title ?? ""}
        message={pending?.message ?? ""}
        confirmLabel={pending?.confirmLabel ?? "OK"}
        cancelLabel={pending?.confirmLabel ? "Cancel" : undefined}
        danger={!!pending?.danger}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const run = pending?.run;
          setPending(null);
          run?.();
        }}
      />
    </AppScreen>
  );
}
