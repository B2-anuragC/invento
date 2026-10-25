import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  type EffectiveAccess,
  type Permission,
  clientRoutePermissions,
} from "@invento/shared";
import {
  appSession,
  fetchEffectiveAccess,
  subscribeAuthorizationInvalidation,
} from "./api";
const Context = createContext<{
  access?: EffectiveAccess;
  error?: string;
  can: (p: Permission) => boolean;
  refresh: () => void;
}>({ can: () => false, refresh: () => {} });
export function PermissionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [access, setAccess] = useState<EffectiveAccess>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => {
    const session = appSession.current;
    if (!session?.businessId) {
      setAccess(undefined);
      return;
    }
    void fetchEffectiveAccess(session)
      .then((a) => {
        if (
          appSession.current?.businessId === session.businessId &&
          appSession.current?.user.id === session.user.id
        ) {
          setAccess(a);
          setError(undefined);
        }
      })
      .catch((e) => {
        setAccess(undefined);
        setError(e.message);
      });
  }, []);
  useEffect(
    () =>
      subscribeAuthorizationInvalidation(() => {
        setAccess(undefined);
        setError(
          "Your business access changed. Retry to refresh your permissions.",
        );
      }),
    [],
  );
  useEffect(() => {
    setAccess(undefined);
    refresh();
    const timer = setInterval(refresh, 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [path, refresh]);
  return (
    <Context.Provider
      value={{
        access,
        error,
        refresh,
        can: (p) =>
          !!access &&
          access.businessId === appSession.current?.businessId &&
          access.userId === appSession.current?.user.id &&
          access.permissions.includes(p),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePermissions = () => useContext(Context);
export function PermissionBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const { access, error, can, refresh } = usePermissions();
  const required = clientRoutePermissions(path);
  if (!required.length) return <>{children}</>;
  if (access && required.some(can)) return <>{children}</>;
  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        {error
          ? "Access unavailable"
          : access
            ? "Access not assigned"
            : "Checking access…"}
      </Text>
      <Text>
        {error ||
          "Your business role determines which features you can use. Contact your business owner if you need access."}
      </Text>
      <Pressable onPress={refresh}>
        <Text>Retry access check</Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/(tabs)/profile")}>
        <Text>Go to your account</Text>
      </Pressable>
    </View>
  );
}

export { clientRoutePermissions } from "@invento/shared";
