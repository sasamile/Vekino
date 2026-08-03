"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Check, Copy, Link2, Loader2, RefreshCw, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mesa: genera y copia el enlace de invitados (sin voto ni quórum). */
export function PanelEnlaceInvitados({
  asambleaId,
  variante = "oscuro",
}: {
  asambleaId: Id<"asambleas">;
  variante?: "oscuro" | "claro";
}) {
  const enlace = useQuery(api.asambleaInvitados.enlaceInvitado, { asambleaId });
  const activar = useMutation(api.asambleaInvitados.activarEnlaceInvitado);
  const desactivar = useMutation(api.asambleaInvitados.desactivarEnlaceInvitado);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oscuro = variante === "oscuro";

  async function asegurar(regenerar = false) {
    setBusy(true);
    setError(null);
    try {
      const r = await activar({ asambleaId, regenerar });
      return r.codigo;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo activar.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    let codigo = enlace?.codigo;
    if (!codigo) codigo = await asegurar(false);
    if (!codigo) return;
    const url = `${window.location.origin}/invitado?codigo=${codigo}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No se pudo copiar el enlace.");
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border p-5",
        oscuro
          ? "border-white/10 bg-white/[0.03] text-white"
          : "border-border bg-card text-foreground",
      )}
    >
      <h2
        className={cn(
          "mb-2 flex items-center gap-2 text-sm font-semibold",
          oscuro ? "text-white/80" : "text-foreground",
        )}
      >
        <UserRound className="h-4 w-4" aria-hidden /> Invitados
      </h2>
      <p
        className={cn(
          "text-sm leading-relaxed",
          oscuro ? "text-white/50" : "text-muted-foreground",
        )}
      >
        Link para personas externas: pueden pedir la palabra y compartir
        pantalla. No votan ni suman al quórum.
      </p>

      {enlace?.activo && enlace.codigo ? (
        <div className="mt-3 space-y-2">
          <p
            className={cn(
              "font-mono text-lg font-bold tracking-[0.2em]",
              oscuro ? "text-white" : "text-foreground",
            )}
          >
            {enlace.codigo}
          </p>
          <p
            className={cn(
              "text-xs",
              oscuro ? "text-white/40" : "text-muted-foreground",
            )}
          >
            {enlace.invitadosUnidos} invitado
            {enlace.invitadosUnidos === 1 ? "" : "s"} con este enlace
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void copiar()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                oscuro
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {copiado ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiado ? "Copiado" : "Copiar enlace"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void asegurar(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                oscuro
                  ? "bg-white/10 text-white hover:bg-white/15"
                  : "bg-muted text-foreground hover:bg-muted/80",
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void desactivar({ asambleaId })
                  .catch(() => {})
                  .finally(() => setBusy(false));
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                oscuro
                  ? "bg-white/10 text-white/70 hover:bg-white/15"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              Desactivar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void asegurar(false).then((c) => c && void copiar())}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
            oscuro
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Activar y copiar enlace
        </button>
      )}

      {error ? (
        <p
          className={cn(
            "mt-2 text-sm",
            oscuro ? "text-red-300" : "text-red-600",
          )}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
