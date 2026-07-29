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
  /** Foto destacada del home (URL S3) o null. */
  coverImage: string | null;
  theme: CondoTheme;
  isSuperadmin: boolean;
  canManage: boolean;
  /** Contadora sin ser administrador del condo. */
  isContadora: boolean;
  /** Membership activo es portería (sin rol admin). */
  isGuardia: boolean;
  /** Miembro de junta directiva (portal + Consejo; no shell admin). */
  isJunta: boolean;
  roles: string[];
  isLoading: boolean;
  selectCondominio: (id: Id<"condominios">, name: string) => void;
  clearCondominio: () => void;
}

const JUNTA_ROLES = ["junta_directiva"];
/** Roles con herramientas admin en mobile (no incluye junta: usa portal + Consejo). */
const MANAGE_ROLES = ["administrador", "contadora", "representante_asamblea"];

const CondominioContext = createContext<CondominioCtx>({
  condominioId: undefined,
  condominioName: null,
  coverImage: null,
  theme: resolveCondoTheme(null),
  isSuperadmin: false,
  canManage: false,
  isContadora: false,
  isGuardia: false,
  isJunta: false,
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

  const membershipForTheme =
    memberships.find((m) => m.condominioId === effectiveId) ??
    activeMembership;

  const effectiveName: string | null = isSuperadmin
    ? (override?.name ?? membershipForTheme?.condominioName ?? null)
    : (membershipForTheme?.condominioName ?? null);

  const primaryFromMembership =
    membershipForTheme?.condominioPrimaryColor ?? null;

  const coverImage =
    membershipForTheme?.condominioCoverImage?.trim() || null;

  const theme = resolveCondoTheme(effectiveName, primaryFromMembership);

  const roles = activeMembership?.roles ?? [];
  const isAdminCondo =
    isSuperadmin || roles.includes("administrador");
  const isContadora =
    !isAdminCondo && roles.includes("contadora");
  const canManage = isSuperadmin
    ? true
    : roles.some((r) => MANAGE_ROLES.includes(r));
  // Portería: tiene rol guardia y no es administración del condo.
  const isGuardia = !canManage && roles.includes("guardia");
  const isJunta = roles.some((r) => JUNTA_ROLES.includes(r));

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
        coverImage,
        theme,
        isSuperadmin,
        canManage,
        isContadora,
        isGuardia,
        isJunta,
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
