"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Si la URL trae `?nuevo=1`, ejecuta `onOpen` y limpia el query
 * (para acciones del topbar por defecto vía Link).
 */
export function useNuevoQuery(onOpen: () => void) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (searchParams.get("nuevo") !== "1") return;
    onOpenRef.current();
    router.replace(pathname, { scroll: false });
  }, [searchParams, pathname, router]);
}
