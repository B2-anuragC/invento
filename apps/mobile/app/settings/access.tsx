import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  PERMISSIONS,
  type BusinessRoleRecord,
  type MembershipRecord,
  type Permission,
} from "@invento/shared";
import { AppScreen, ActionButton } from "@/components/invento-ui";
import { accessRequest, appSession } from "@/services/api";
import { usePermissions } from "@/services/permissions";

export default function BusinessAccessScreen() {
  const { access, can, refresh } = usePermissions();
  const router = useRouter();
  const [roles, setRoles] = useState<BusinessRoleRecord[]>([]);
  const [members, setMembers] = useState<MembershipRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("VIEWER");
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
  async function write(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await accessRequest(path, {
        method,
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      setEditing(null);
      setRevision((v) => v + 1);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const button = (text: string, action: () => void, selected = false) => (
    <Pressable
      key={text}
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
        {button("← Back", () => router.back())}
        <Text style={{ fontSize: 26, fontWeight: "700" }}>
          Users & permissions
        </Text>
        <Text>
          Selected business · {appSession.current?.businessName}. Role:{" "}
          {access?.role}. Changes apply on web and mobile.
        </Text>
        <Text accessibilityRole="alert" style={{ color: "#a13e37" }}>
          {error}
        </Text>
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
                <Text>
                  {m.user.name} · {m.user.email}
                </Text>
                <Text>
                  {m.role} · {m.isActive ? "Active" : "Inactive"}
                  {!m.user.isActive ? " · Account suspended" : ""}
                </Text>
                {m.user.id !== appSession.current?.user.id &&
                  can("members.update") && (
                    <>
                      {can("roles.view") &&
                        roles
                          .filter(
                            (r) =>
                              (r.key !== "OWNER" || access?.role === "OWNER") &&
                              r.permissions.every((p) => can(p)),
                          )
                          .map((r) =>
                            button(
                              `Assign ${r.name}`,
                              () =>
                                void write(
                                  `members/${encodeURIComponent(m.user.id)}`,
                                  "PATCH",
                                  { role: r.key },
                                ),
                              m.role === r.key,
                            ),
                          )}
                      {(!m.isActive || can("members.remove")) &&
                        button(
                          m.isActive
                            ? "Deactivate membership"
                            : "Reactivate membership",
                          () =>
                            void write(
                              `members/${encodeURIComponent(m.user.id)}`,
                              "PATCH",
                              { isActive: !m.isActive },
                            ),
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
            {roles
              .filter(
                (r) =>
                  (r.key !== "OWNER" || access?.role === "OWNER") &&
                  r.permissions.every((p) => can(p)),
              )
              .map((r) =>
                button(
                  r.name,
                  () => setSelectedRole(r.key),
                  selectedRole === r.key,
                ),
              )}
            <ActionButton
              title={busy ? "Saving…" : "Add member"}
              onPress={() => {
                if (!busy)
                  void write("members", "POST", { email, role: selectedRole });
              }}
            />
          </>
        )}
        {can("roles.view") && (
          <>
            <Text style={{ fontSize: 20, fontWeight: "600" }}>Roles</Text>
            {roles.map((r) => (
              <View key={r.key}>
                <Text>
                  {r.name} · {r.permissions.length} permissions
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
                      {button(
                        `Delete ${r.name}`,
                        () =>
                          void write(
                            `roles/${encodeURIComponent(r.key)}`,
                            "DELETE",
                          ),
                      )}
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
              {PERMISSIONS.filter((p) => can(p)).map((p) =>
                button(`${permissions.includes(p) ? "☑" : "☐"} ${p}`, () =>
                  setPermissions(
                    permissions.includes(p)
                      ? permissions.filter((v) => v !== p)
                      : [...permissions, p],
                  ),
                ),
              )}
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
    </AppScreen>
  );
}
