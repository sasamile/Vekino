"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Home, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type UnidadElegida = { _id: Id<"unidades">; numero: string; torre: string | null };

/**
 * Escoge una o varias casas para una novedad.
 *
 * Ninguna es una respuesta válida: la mayoría de las novedades son de la
 * portería o de una zona común y no le competen a nadie en particular. Por
 * eso no hay estado de error cuando la lista está vacía.
 *
 * Varias porque hay novedades que tocan a más de una casa —una gotera entre
 * dos apartamentos, un ruido que afecta a la manzana—. Cuando solo se podía
 * una, el guarda abría un reporte y escribía el resto en la descripción,
 * donde después no se puede buscar.
 */
export function SelectorUnidades({
  condominioId,
  elegidas,
  onChange,
}: {
  condominioId: Id<"condominios">;
  elegidas: UnidadElegida[];
  onChange: (u: UnidadElegida[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // Espera a que deje de escribir: si no, va una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const resultados = useQuery(
    api.guardia.buscarUnidad,
    busqueda.length >= 1 ? { condominioId, texto: busqueda } : "skip",
  );

  const yaEsta = (id: Id<"unidades">) => elegidas.some((e) => e._id === id);
  const etiqueta = (u: UnidadElegida) =>
    [u.torre, u.numero].filter(Boolean).join(" ");

  return (
    <div className="space-y-2">
      {elegidas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elegidas.map((u) => (
            <span
              key={u._id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[13px] font-medium text-foreground"
            >
              <Home className="h-3 w-3 text-muted-foreground" aria-hidden />
              {etiqueta(u)}
              <button
                type="button"
                onClick={() => onChange(elegidas.filter((e) => e._id !== u._id))}
                aria-label={`Quitar ${etiqueta(u)}`}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar casa por número…"
          className="pl-9"
        />
      </div>

      {busqueda.length >= 1 && resultados === undefined ? (
        <div className="flex justify-center py-2">
          <Spinner className="h-4 w-4" />
        </div>
      ) : resultados && resultados.length > 0 ? (
        <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {resultados.map((u) => (
            <li key={u._id}>
              <button
                type="button"
                disabled={yaEsta(u._id)}
                onClick={() => {
                  onChange([...elegidas, u]);
                  setTexto("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-40"
              >
                <Home className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {etiqueta(u)}
                {yaEsta(u._id) && (
                  <span className="ml-auto text-xs text-muted-foreground">ya está</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : resultados && busqueda.length >= 1 ? (
        <p className="px-1 text-[13px] text-muted-foreground">
          Ninguna casa con ese número.
        </p>
      ) : null}
    </div>
  );
}
