"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SetOverride = (node: ReactNode | null) => void;

const SetCtx = createContext<SetOverride | null>(null);
const OverrideCtx = createContext<ReactNode | null>(null);

export function AdminTopbarProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<ReactNode | null>(null);
  const setOverride = useCallback<SetOverride>((node) => {
    setOverrideState(node);
  }, []);

  return (
    <SetCtx.Provider value={setOverride}>
      <OverrideCtx.Provider value={override}>{children}</OverrideCtx.Provider>
    </SetCtx.Provider>
  );
}

/**
 * Registra acciones del topbar para la página actual.
 * El setter vive en un context aparte del valor, para no entrar en bucle
 * de updates (setOverride → nuevo ctx → effect otra vez).
 */
export function useTopbarActions(actions: ReactNode | null, deps: unknown[] = []) {
  const setOverride = useContext(SetCtx);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useLayoutEffect(() => {
    if (!setOverride) return;
    setOverride(actionsRef.current);
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps las controla el caller
  }, [setOverride, ...deps]);
}

export function useTopbarOverride() {
  return useContext(OverrideCtx);
}
