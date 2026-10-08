"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, SearchCheck } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { formatPeriodoLabel } from "@/components/layout/periodo-select";
import { cop } from "@/lib/utils";

const RESOLUCION: Record<string, string> = {
  documento_corregido: "La factura siguiente se corrigió",
  aplicado_en_documento_posterior: "Un documento posterior lo muestra aplicado",
  pago_reversado: "El pago se reversó",
  administracion: "Resuelta por la administración",
};

function unidad(u: { unidadTorre: string | null; unidadNumero: string }) {
  return [u.unidadTorre, u.unidadNumero].filter(Boolean).join(" ");
}

/**
 * Pagos por revisar (Fase 3 de la auditoría de facturación).
 *
 *   · Discrepancias: Vekino registró un pago (pasarela o comprobante) y la
 *     factura siguiente no lo refleja. La vigente de esa unidad no se cobra
 *     en línea mientras tanto. Se resuelven solas cuando llega un documento
 *     que sí lo refleja; aquí se resuelven a mano, con nota.
 *   · Excedentes: pagos por encima de lo que se debía. Se informan.
 *   · Pagos sin estado final: la pasarela no confirmó y la consulta
 *     automática se rindió.
 */
export function PagosPorRevisar({ condominioId }: { condominioId: Id<"condominios"> }) {
  const datos = useQuery(api.facturas.pagosPorRevisar, { condominioId });
  const resolver = useMutation(api.facturas.resolverDiscrepancia);
  const [resolviendo, setResolviendo] = useState<{ id: Id<"discrepanciasPago">; texto: string } | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!datos) return null;
  const abiertas = datos.discrepancias.filter((d) => d.estado === "abierta");
  const resueltas = datos.discrepancias.filter((d) => d.estado === "resuelta").slice(0, 5);
  if (abiertas.length === 0 && resueltas.length === 0 && datos.excedentes.length === 0 && datos.sinEstadoFinal.length === 0) {
    return null;
  }

  async function guardar() {
    if (!resolviendo) return;
    setGuardando(true);
    setError(null);
    try {
      await resolver({ id: resolviendo.id, nota });
      setResolviendo(null);
      setNota("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <SearchCheck className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Pagos por revisar</p>
        {abiertas.length > 0 ? <Badge tone="info">{abiertas.length} en verificación</Badge> : null}
      </div>

      {abiertas.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Pagos registrados en Vekino que la contabilidad todavía no refleja. Mientras estén abiertos, la factura
            vigente de la unidad no se cobra en línea (se le cobraría dos veces) y la unidad no aparece en mora por ese
            monto. Se cierran solos al cargar un documento que los refleje.
          </p>
          <div className="max-h-72 space-y-2 overflow-auto">
            {abiertas.map((d) => (
              <div key={d._id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    Unidad {unidad(d)} · {formatPeriodoLabel(d.periodo)}
                    <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                      {cop(d.montoNoAplicado)} sin reflejar
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pagado {cop(d.montoPagado)} de {cop(d.montoAdeudado)}
                    {d.pagos > 0 ? ` · ${d.pagos} pago${d.pagos === 1 ? "" : "s"} en línea` : ""}
                    {d.comprobantes > 0 ? ` · ${d.comprobantes} comprobante${d.comprobantes === 1 ? "" : "s"}` : ""}. La factura de{" "}
                    {formatPeriodoLabel(d.periodoSiguiente)} arrastra {cop(d.saldoAnteriorSiguiente)} de saldo anterior.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResolviendo({
                      id: d._id,
                      texto: `Unidad ${unidad(d)} · ${formatPeriodoLabel(d.periodo)} · ${cop(d.montoNoAplicado)} sin reflejar`,
                    });
                    setNota("");
                    setError(null);
                  }}
                >
                  Resolver
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {resueltas.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Resueltas recientes</summary>
          <ul className="mt-2 space-y-1">
            {resueltas.map((d) => (
              <li key={d._id} className="text-muted-foreground">
                Unidad {unidad(d)} · {formatPeriodoLabel(d.periodo)} · {cop(d.montoNoAplicado)} ·{" "}
                {RESOLUCION[d.resolucion?.tipo ?? ""] ?? "Resuelta"}
                {d.resolucion?.nota ? ` — ${d.resolucion.nota}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {datos.excedentes.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-foreground">Pagado de más</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {datos.excedentes.map((e) => (
              <li key={e.facturaId}>
                Unidad {unidad(e)} · {formatPeriodoLabel(e.periodo)} · pagó {cop(e.montoPagado)} sobre {cop(e.montoAdeudado)}:{" "}
                <span className="font-medium text-foreground">{cop(e.excedente ?? 0)} de más</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {datos.sinEstadoFinal.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-foreground">Pagos en línea sin confirmación del banco</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {datos.sinEstadoFinal.map((p) => (
              <li key={p.pagoId}>
                Unidad {unidad(p)} · {cop(p.monto)} · iniciado el {new Date(p.createdAt).toLocaleDateString("es-CO")} · la
                pasarela no respondió con un estado final. Revísalo con el banco.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {resolviendo ? (
        <Modal
          open
          onClose={() => setResolviendo(null)}
          title="Resolver discrepancia"
          description={resolviendo.texto}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setResolviendo(null)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={guardando || !nota.trim()} onClick={guardar}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Resolver"}
              </Button>
            </>
          }
        >
          <p className="mb-2 text-sm text-muted-foreground">
            Al resolverla, la factura vigente de la unidad vuelve a poderse pagar por el valor de su documento.
            Hazlo solo si la contabilidad ya aplicó el pago o confirmó que no corresponde; si va a emitir un
            documento corregido, no hace falta: al cargarlo, se resuelve sola.
          </p>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué se verificó y con quién"
            rows={3}
          />
          {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
