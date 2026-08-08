"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Deja constancia de que esta persona usó un módulo hoy.
 *
 * Se llama desde las pantallas, no desde el router, para que el módulo lo
 * declare quien sabe qué es: una ruta como `/condominio/[id]` no dice nada
 * sobre si el usuario fue a pagar o a reservar.
 *
 * Dispara UNA vez por módulo mientras la pestaña esté abierta. El backend ya
 * agrupa por día, así que reintentar no ensucia el dato; el guard es solo
 * para no mandar una mutation por cada render.
 *
 * Si falla, se traga el error a propósito: una métrica no puede tumbarle la
 * pantalla a un residente que entró a pagar.
 */
export function useRegistrarUso(
  modulo: string,
  condominioId?: Id<"condominios"> | null,
) {
  const registrar = useMutation(api.uso.registrar);
  const yaFue = useRef<string | null>(null);

  useEffect(() => {
    const clave = `${modulo}:${condominioId ?? "-"}`;
    if (yaFue.current === clave) return;
    yaFue.current = clave;
    void registrar({
      modulo,
      condominioId: condominioId ?? undefined,
    }).catch(() => {});
  }, [modulo, condominioId, registrar]);
}
