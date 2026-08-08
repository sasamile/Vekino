"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

/** Espera a que deje de escribir antes de consultar. */
function useDebounced<T>(valor: T, ms = 300) {
  const [lento, setLento] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setLento(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return lento;
}

/**
 * Vincula a mano una conversación con un residente.
 *
 * Existe porque hay gente a la que el sistema no puede identificar solo:
 * quien activó su @usuario de Meta no comparte teléfono, así que no hay con
 * qué cruzarlo. El equipo sí sabe quién es —lo dice en el propio mensaje— y
 * hasta ahora no tenía cómo decírselo al sistema; la conversación se quedaba
 * en «Sin identificar» y no se le podían mandar ni sus accesos.
 */
export function VincularDialog({
  conversacionId,
  nombrePerfil,
  abierto,
  onAbierto,
}: {
  conversacionId: Id<"waConversations">;
  /** Nombre del perfil de WhatsApp, para arrancar la búsqueda con algo. */
  nombrePerfil: string;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const textoLento = useDebounced(texto);
  const [guardando, setGuardando] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vincular = useMutation(api.whatsappInbox.vincularAResidente);
  const resultados = useQuery(
    api.whatsappInbox.buscarResidentes,
    textoLento.trim().length >= 2 ? { texto: textoLento.trim() } : "skip",
  );

  useEffect(() => {
    if (abierto) {
      setTexto(nombrePerfil ?? "");
      setError(null);
    }
  }, [abierto, nombrePerfil]);

  async function elegir(userId: Id<"users">) {
    setGuardando(userId);
    setError(null);
    try {
      await vincular({ conversacionId, userId });
      onAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular.");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={() => onAbierto(false)}
      className="sm:max-w-lg"
      title="¿Quién es esta persona?"
      description="Búscala por nombre, correo o número de unidad. Al vincularla podrás mandarle sus accesos."
    >
      <div className="flex max-h-[60dvh] min-h-0 flex-col">
        <div className="relative pb-3">
          <Search
            className="pointer-events-none absolute left-3 top-[18px] h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, correo, «torre 3 404»…"
            className="pl-9"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {error && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden
              />
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {texto.trim().length < 2 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Escribe al menos dos letras.
            </p>
          )}

          {texto.trim().length >= 2 && resultados === undefined && (
            <div className="flex justify-center py-6">
              <Spinner className="h-5 w-5" />
            </div>
          )}

          {resultados?.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nadie coincide. Prueba con el apellido o solo con el número de
              apartamento.
            </p>
          )}

          {(resultados ?? []).map((r) => (
            <button
              key={r.userId}
              type="button"
              disabled={guardando != null}
              onClick={() => void elegir(r.userId)}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-ring/50 hover:bg-muted/40 disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.nombre}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.email}
                  {r.unidades.length > 0 && ` · ${r.unidades.join(", ")}`}
                </p>
                <p className="truncate text-[11px] text-muted-foreground/80">
                  {r.condominio}
                  {r.telefono ? ` · ${r.telefono}` : " · sin teléfono"}
                </p>
              </div>
              {guardando === r.userId ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <span className="shrink-0 text-xs font-medium text-brand">
                  Vincular
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Al vincular, esta conversación pasa a ver los datos de esa cuenta:
          sus facturas, sus unidades y sus accesos. Asegúrate de que es quien
          dice ser.
        </p>
      </div>
    </Modal>
  );
}
