import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { resolveCondoTheme, type CondoTheme } from "@/lib/condo-theme";

const STORAGE_KEY = "vekino.activeCondominio";

interface CondominioCtx {
  condominioId: Id<"condominios"> | undefined;
  condominioName: string | null;
  theme: CondoTheme;
  isSuperadmin: boolean;
  canManage: boolean;
  /** Membership activo es portería (sin rol admin). */
  isGuardia: boolean;
  roles: string[];
  isLoading: boolean;
  selectCondominio: (id: Id<"condominios">, name: string) => void;
  clearCondominio: () => void;
}

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora", "representante_asamblea"];

const CondominioContext = createContext<CondominioCtx>({
  condominioId: undefined,
  condominioName: null,
  theme: resolveCondoTheme(null),
  isSuperadmin: false,
  canManage: false,
  isGuardia: false,
  roles: [],
  isLoading: true,
  selectCondominio: () => {},
  clearCondominio: () => {},
});

export function CondominioProvider({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.users.me);
  const [override, setOverride] = useState<{
    id: Id<"condominios">;
    name: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as { id?: string; name?: string };
          if (parsed.id && parsed.name) {
            setOverride({
              id: parsed.id as Id<"condominios">,
              name: parsed.name,
            });
          }
        } catch {
          // ignore corrupt cache
        }
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperadmin = me?.isSuperadmin ?? false;
  const memberships = me?.memberships ?? [];

  const activeMembership =
    memberships.find((m) => m.condominioId === override?.id) ?? memberships[0];

  const effectiveId: Id<"condominios"> | undefined = isSuperadmin
    ? override?.id
    : (activeMembership?.condominioId as Id<"condominios"> | undefined);

  const effectiveName: string | null = isSuperadmin
    ? (override?.name ?? null)
    : (activeMembership?.condominioName ?? null);

  const primaryFromMembership = isSuperadmin
    ? null
    : (activeMembership?.condominioPrimaryColor ?? null);

  const theme = resolveCondoTheme(effectiveName, primaryFromMembership);

  const roles = activeMembership?.roles ?? [];
  const canManage = isSuperadmin
    ? true
    : roles.some((r) => ADMIN_ROLES.includes(r));
  // Portería: tiene rol guardia y no es administración del condo.
  const isGuardia = !canManage && roles.includes("guardia");

  function selectCondominio(id: Id<"condominios">, name: string) {
    setOverride({ id, name });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
  }

  function clearCondominio() {
    setOverride(null);
    void AsyncStorage.removeItem(STORAGE_KEY);
  }

  return (
    <CondominioContext.Provider
      value={{
        condominioId: effectiveId,
        condominioName: effectiveName,
        theme,
        isSuperadmin,
        canManage,
        isGuardia,
        roles,
        isLoading: me === undefined || !hydrated,
        selectCondominio,
        clearCondominio,
      }}
    >
      {children}
    </CondominioContext.Provider>
  );
}

export function useCondominio() {
  return useContext(CondominioContext);
}
