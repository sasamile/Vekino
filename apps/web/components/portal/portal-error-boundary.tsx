"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBoundary, ErrorMessage } from "@/components/ui/error-boundary";

/**
 * El contenido de las páginas del portal del residente, contenido.
 *
 * `useQuery` lanza el error al pintar. Sin nada que lo recoja, una consulta
 * que falla (por ejemplo, una función que el backend desplegado todavía no
 * tiene) se llevaba la página entera: "Mis facturas" o el inicio quedaban en
 * blanco, sin menú. Aquí queda un mensaje dentro del portal, con el menú a la
 * vista; al cambiar de página o con "Reintentar" se vuelve a intentar.
 */
export function PortalErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [intento, setIntento] = useState(0);
  return (
    <ErrorBoundary
      resetKey={`${pathname}#${intento}`}
      fallback={() => (
        <div role="alert" className="mx-auto max-w-md rounded-xl border border-border bg-card px-4 py-6 text-center">
          <ErrorMessage
            title="No se pudo cargar esta sección"
            detail="Revisa tu conexión e inténtalo de nuevo. Si sigue pasando, avísale a la administración."
          />
          <Button variant="outline" className="min-h-11" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
