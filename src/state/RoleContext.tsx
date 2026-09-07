import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { IDENTITIES, SENSITIVE_DATA_ROLES } from "../data/identities";
import type { Identity } from "../data/types";

interface RoleContextValue {
  identity: Identity;
  setIdentityKey: (key: string) => void;
  identities: Identity[];
  canViewSensitive: boolean;
  isSupervisor: boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const STORAGE_KEY = "lisd-identity";

function getInitialKey(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && IDENTITIES.some((i) => i.key === stored)) return stored;
  } catch {
    /* private browsing / storage disabled — fall through to default */
  }
  return IDENTITIES[0].key;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [identityKey, setIdentityKeyState] = useState<string>(getInitialKey);

  const setIdentityKey = (key: string) => {
    setIdentityKeyState(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore — storage unavailable */
    }
  };

  const value = useMemo<RoleContextValue>(() => {
    const identity = IDENTITIES.find((i) => i.key === identityKey) ?? IDENTITIES[0];
    return {
      identity,
      setIdentityKey,
      identities: IDENTITIES,
      canViewSensitive: SENSITIVE_DATA_ROLES.has(identity.role),
      isSupervisor: identity.role === "supervisor",
    };
  }, [identityKey]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
