"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

function useDebounced<T>(valor: T, ms = 300) {
  const [lento, setLento] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setLento(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return lento;
}

/**
 * Manda los datos de acceso de un residente a esta conversación.
 *
 * Se elige de QUIÉN son las credenciales, y no se deduce, porque con los
 * @usuario de Meta la mayoría de conversaciones no se pueden identificar: la
 * persona no comparte su número y no hay nada con qué cruzarla. Quien atiende
 * sí sabe de quién se trata —lo dice el propio mensaje: torre, apartamento,
 * nombre— y aquí lo indica.
 *
 * Eso hace que el equipo pueda mandar la clave de una persona a un chat que
 * no es suyo, así que el diálogo lo dice sin adornos antes de enviar.
 */
export function AccesosDialog({
  conversacionId,
  nombreConversacion,
  identificado,
  abierto,
  onAbierto,
}: {
  conversacionId: Id<"waConversations">;
  nombreConversacion: string;
  /** Si la conversación ya tiene dueño, se ofrece mandarle las suyas. */
  identificado: boolean;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const textoLento = useDebounced(texto);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const enviarAccesos = useAction(api.whatsappInbox.enviarAccesos);
  const resultados = useQuery(
    api.whatsappInbox.buscarResidentes,
    textoLento.trim().length >= 2 ? { texto: textoLento.trim() } : "skip",
  );

  useEffect(() => {
    if (!abierto) return;
    setTexto("");
    setError(null);
    setOk(null);
  }, [abierto]);

  async function enviar(userId: Id<"users"> | undefined, nombre: string) {
    if (
      !window.confirm(
        `Se le va a generar una contraseña NUEVA a ${nombre} y se manda a este chat (${nombreConversacion}).\n\nSi ya tenía una propia, dejará de servirle.`,
      )
    ) {
      return;
    }
    setEnviando(userId ?? "propio");
    setError(null);
    setOk(null);
    try {
      const r = await enviarAccesos({ conversacionId, userId });
      if (r.ok) {
        setOk(`Enviados los accesos de ${nombre}.`);
        setTimeout(() => onAbierto(false), 1200);
      } else {
        setError(r.motivo ?? "No se pudo enviar.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={() => onAbierto(false)}
      className="sm:max-w-lg"
      title="¿De quién son las credenciales?"
      description={`Se mandan a este chat: ${nombreConversacion}`}
    >
      <div className="flex max-h-[60dvh] min-h-0 flex-col">
        {identificado && (
          <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Esta conversación ya está vinculada.
            </p>
            <Button
              size="sm"
              className="mt-2"
              disabled={enviando != null}
              onClick={() => void enviar(undefined, nombreConversacion)}
            >
              {enviando === "propio" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Mandar los de {nombreConversacion}
            </Button>
          </div>
        )}

        <div className="relative pb-3">
          <Search
            className="pointer-events-none absolute left-3 top-[18px] h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca por nombre, correo o «torre 3 404»…"
            className="pl-9"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {ok && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              {ok}
            </p>
          )}
          {error && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-red-700 dark:text-red-400">
                {error}
              </p>
            </div>
          )}

          {texto.trim().length < 2 && !ok && (
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
              Nadie coincide. Prueba con el apellido o solo con el apartamento.
            </p>
          )}

          {(resultados ?? []).map((r) => (
            <button
              key={r.userId}
              type="button"
              disabled={enviando != null}
              onClick={() => void enviar(r.userId, r.nombre)}
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
                </p>
              </div>
              {enviando === r.userId ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <span className="shrink-0 text-xs font-medium text-brand">
                  Enviar
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          La clave que se genere entra a la cuenta de esa persona. Asegúrate de
          que quien escribe es quien dice ser antes de mandarla.
        </p>
      </div>
    </Modal>
  );
}
