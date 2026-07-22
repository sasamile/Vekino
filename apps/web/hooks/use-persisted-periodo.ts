"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "vekino.admin.periodo.";

/**
 * Periodo de facturación (`YYYY-MM`) persistido por condominio en localStorage.
 */
export function usePersistedPeriodo(
  condominioId: string,
  periodos: string[] | undefined,
) {
  const key = `${PREFIX}${condominioId}`;
  const [periodo, setPeriodoState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setPeriodoState(stored);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated || !periodos || periodos.length === 0) return;
    setPeriodoState((current) => {
      if (current && periodos.includes(current)) return current;
      try {
        const stored = localStorage.getItem(key);
        if (stored && periodos.includes(stored)) return stored;
      } catch {
        /* ignore */
      }
      return periodos[0]!;
    });
  }, [hydrated, periodos, key]);

  const setPeriodo = useCallback(
    (next: string) => {
      setPeriodoState(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return {
    periodo: periodo && periodos?.includes(periodo) ? periodo : (periodos?.[0] ?? null),
    setPeriodo,
    ready: hydrated && periodos !== undefined,
  };
}

export function periodoStorageKey(condominioId: string) {
  return `${PREFIX}${condominioId}`;
}
