import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { isServerUnreachable, sameAccess } from "./access-fallback";
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
  const accessRef = useRef(access);
  accessRef.current = access;
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
          // Same grants keep the same object, so the periodic refresh re-renders nothing.
          setAccess((current) => (sameAccess(current, a) ? current : a));
          setError(undefined);
        }
      })
      .catch((e) => {
        // A network blip keeps the last known permissions; only a refusal removes them.
        if (isServerUnreachable(e) && accessRef.current) return;
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
    // Permissions are rechecked on navigation without clearing them first: can()
    // already rejects permissions that belong to another account or business.
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
  const can = useCallback(
    (p: Permission) =>
      !!access &&
      access.businessId === appSession.current?.businessId &&
      access.userId === appSession.current?.user.id &&
      access.permissions.includes(p),
    [access],
  );
  const value = useMemo(() => ({ access, error, refresh, can }), [access, error, refresh, can]);
  return (
    <Context.Provider value={value}>
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
