import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ROLE_PERMISSIONS, SENSITIVE_DATA_ROLES } from "../data/identities";
import type { Identity, Permission } from "../data/types";
import { api, ApiError } from "../lib/api";
import Login from "../pages/Login";
import { ForcedPasswordChange } from "../components/ChangePassword";
import { ForcedTwoFactorSetup } from "../components/Account";
import { useBi } from "../lib/useBi";

interface RoleContextValue {
  identity: Identity;
  setIdentityKey: (key: string) => Promise<void>;
  identities: Identity[];
  canViewSensitive: boolean;
  isSupervisor: boolean;
  /** NFR-03: whether the signed-in role may perform an operation (the API enforces the same rule). */
  can: (permission: Permission) => boolean;
  /** Demo deployments allow switching user from the header and resetting the demo data. */
  demoMode: boolean;
  /** Signed in through "Continue as guest": read-only, prices masked. */
  isGuest: boolean;
  signOut: () => Promise<void>;
  /** Re-reads the sign-in list (after users are added, renamed or disabled). */
  refreshIdentities: () => void;
  twoFactorEnabled: boolean;
  /** The role must use two-step sign-in, so it can't be turned off. */
  twoFactorRequired: boolean;
  /** Re-reads the signed-in user (after turning two-step sign-in on or off). */
  refreshSession: () => void;
}

type SessionUserInfo = Identity & { mustChangePassword?: boolean; twoFactorEnabled?: boolean; twoFactorSetupRequired?: boolean; twoFactorRequired?: boolean };

const RoleContext = createContext<RoleContextValue | null>(null);

interface MeResponse {
  user: SessionUserInfo;
  demoMode: boolean;
}

type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error" }
  | { status: "signedIn"; user: SessionUserInfo; demoMode: boolean };

/** The signed-in user (from the API session). Shows the sign-in page until there is one. */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [guestAccess, setGuestAccess] = useState(false);

  const loadMe = useCallback(
    () =>
      api<MeResponse>("/api/auth/me").then(
        (me) => setSession({ status: "signedIn", user: me.user, demoMode: me.demoMode }),
        (e) => setSession(e instanceof ApiError && e.status === 401 ? { status: "signedOut" } : { status: "error" }),
      ),
    [],
  );

  // Who is signed in (from the session cookie), and the user list for the sign-in page.
  const refreshIdentities = useCallback(() => {
    api<Identity[]>("/api/users").then(setIdentities, () => setIdentities([]));
  }, []);

  useEffect(() => {
    loadMe();
    refreshIdentities();
    api<{ guestAccess: boolean }>("/api/auth/options").then((o) => setGuestAccess(o.guestAccess), () => setGuestAccess(false));
  }, [loadMe, refreshIdentities]);

  const continueAsGuest = useCallback(async () => {
    const me = await api<MeResponse>("/api/auth/guest", { method: "POST" });
    setSession({ status: "signedIn", user: me.user, demoMode: me.demoMode });
  }, []);

  const setIdentityKey = useCallback(async (key: string) => {
    const me = await api<MeResponse>("/api/auth/switch", { method: "POST", body: { key } });
    setSession({ status: "signedIn", user: me.user, demoMode: me.demoMode });
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession({ status: "signedOut" });
  }, []);

  const value = useMemo<RoleContextValue | null>(() => {
    if (session.status !== "signedIn") return null;
    const identity = session.user;
    return {
      identity,
      setIdentityKey,
      identities,
      canViewSensitive: SENSITIVE_DATA_ROLES.has(identity.role),
      isSupervisor: identity.role === "supervisor",
      can: (permission: Permission) => ROLE_PERMISSIONS[identity.role]?.has(permission) ?? false,
      demoMode: session.demoMode,
      isGuest: identity.role === "guest",
      signOut,
      refreshIdentities,
      twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
      twoFactorRequired: Boolean(session.user.twoFactorRequired),
      refreshSession: () => void loadMe(),
    };
  }, [session, identities, setIdentityKey, signOut, refreshIdentities, loadMe]);

  if (session.status === "loading") return <div className="min-h-screen bg-canvas" />;
  if (session.status !== "signedIn" || !value)
    return (
      <Login
        identities={identities}
        unreachable={session.status === "error"}
        onSignedIn={loadMe}
        onGuest={guestAccess ? continueAsGuest : undefined}
      />
    );
  // A temporary password set by an administrator has to be replaced before anything else.
  if (session.user.mustChangePassword) return <ForcedPassword name={session.user.name} onDone={loadMe} onSignOut={signOut} />;
  // The role must use two-step sign-in and it isn't set up yet.
  if (session.user.twoFactorSetupRequired) return <ForcedTwoFactor name={session.user.name} onDone={loadMe} onSignOut={signOut} />;
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

function ForcedPassword({ name, onDone, onSignOut }: { name: Identity["name"]; onDone: () => void; onSignOut: () => void }) {
  const bi = useBi();
  return <ForcedPasswordChange name={bi(name)} onDone={onDone} onSignOut={() => void onSignOut()} />;
}

function ForcedTwoFactor({ name, onDone, onSignOut }: { name: Identity["name"]; onDone: () => void; onSignOut: () => void }) {
  const bi = useBi();
  return <ForcedTwoFactorSetup name={bi(name)} onDone={onDone} onSignOut={() => void onSignOut()} />;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
