"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Si la URL trae `?comunicado=<id>&condominio=<id>`, abre el diálogo de
 * difusión con ese comunicado ya elegido y limpia el query.
 *
 * Es lo que hace que el botón «Difundir» de una circular caiga en el
 * formulario listo para programar, en vez de obligar a buscar el título a
 * mano en una lista de cincuenta.
 */
export function useComunicadoQuery(
  onOpen: (comunicadoId: string, condominioId: string) => void,
) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const comunicado = searchParams.get("comunicado");
    const condominio = searchParams.get("condominio");
    if (!comunicado || !condominio) return;
    onOpenRef.current(comunicado, condominio);
    router.replace(pathname, { scroll: false });
  }, [searchParams, pathname, router]);
}
