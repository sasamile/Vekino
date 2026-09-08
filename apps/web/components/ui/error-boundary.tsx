"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Acota el daño de una consulta que falla.
 *
 * `useQuery` de Convex no devuelve el error: lo lanza durante el render. Sin
 * nada que lo recoja, un fallo leyendo la cartera de UNA casa se lleva por
 * delante la página entera de reservas —la tabla, los filtros, los botones de
 * aprobar—, que es justo lo que no puede pasar: el resto de las solicitudes
 * no tiene la culpa.
 *
 * Envolviendo solo el trozo que consulta, lo que se cae es ese trozo.
 *
 * Tiene que ser una clase: los hooks no pueden capturar errores de render, y
 * React no ofrece equivalente en función.
 */
export class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    /** Qué mostrar en su lugar. Recibe el error por si conviene enseñarlo. */
    fallback: (error: Error) => React.ReactNode;
    /** Cambiarlo reintenta: sirve para volver a intentar al reabrir. */
    resetKey?: unknown;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

/** Mensaje de error estándar, para no escribirlo en cada pantalla. */
export function ErrorMessage({
  title = "No se pudo cargar",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail && (
        <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}
