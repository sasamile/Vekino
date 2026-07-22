"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";

type Step = "idle" | "uploading" | "preview" | "inserting" | "done";

interface InvoiceRow {
  unitIdentifier: string;
  residenteNombre: string;
  numeroInterno: string;
  periodoLabel: string;
  apto?: string;
  vrAdmon: number;
  lineas: Array<{ codigo: number; concepto: string; saldoAnterior: number; actual: number; total: number }>;
  saldoAFavor: number;
  totalAPagar: number;
  totalConDescuento?: number;
  pdfUrl: string;
  pageCount: number;
  format: "arboleda" | "cdc";
  // resolved after matching
  unidadId?: Id<"unidades">;
  matchStatus?: "ok" | "no-match";
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

export function UploadFacturas({
  condominioId,
  condominioLegacyId,
  currentPeriodo,
  onDone,
}: {
  condominioId: Id<"condominios">;
  condominioLegacyId: string;
  currentPeriodo: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [periodo, setPeriodo] = useState(currentPeriodo);
  const [soloNuevas, setSoloNuevas] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ pages: number[]; error: string }>>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({
    inserted: 0, updated: 0, skipped: 0, errors: 0,
    conciliacion: { pagadas: 0, abonadas: 0, vencidas: 0 },
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkUpsert = useMutation(api.facturas.bulkUpsert);
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });

  function close() {
    setOpen(false);
    setStep("idle");
    setInvoices([]);
    setParseErrors([]);
    setProgress({ done: 0, total: 0 });
    setSoloNuevas(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep("uploading");
    setInvoices([]);
    setParseErrors([]);

    const form = new FormData();
    form.append("pdf", file);
    form.append("condominioLegacyId", condominioLegacyId);
    form.append("periodo", periodo);

    try {
      const res = await fetch("/api/facturas/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      // Match each invoice to a unidad
      const unitMap = new Map<string, Id<"unidades">>();
      for (const u of unidades ?? []) {
        unitMap.set(u.numero.trim(), u._id);
      }

      const rows: InvoiceRow[] = (data.invoices as InvoiceRow[]).map((inv) => {
        const key = inv.unitIdentifier.trim();
        const unidadId = unitMap.get(key);
        return { ...inv, unidadId, matchStatus: unidadId ? "ok" : "no-match" };
      });

      setInvoices(rows);
      setParseErrors(data.parseErrors ?? []);
      setStep("preview");
    } catch (e: any) {
      alert("Error procesando PDF: " + e.message);
      setStep("idle");
    }
  }

  async function handleInsert() {
    const matched = invoices.filter((i) => i.matchStatus === "ok" && i.unidadId);
    setStep("inserting");
    setProgress({ done: 0, total: matched.length });

    const BATCH = 20;
    let inserted = 0, updated = 0, skipped = 0, errors = 0;
    const conciliacion = { pagadas: 0, abonadas: 0, vencidas: 0 };
    const fechaVencimiento = (() => {
      const parts = periodo.split("-").map(Number);
      return new Date(parts[0] ?? 2026, parts[1] ?? 1, 15).getTime();
    })();

    for (let i = 0; i < matched.length; i += BATCH) {
      const batch = matched.slice(i, i + BATCH);
      try {
        const res = await bulkUpsert({
          skipExisting: soloNuevas,
          facturas: batch.map((inv, bi) => ({
            condominioId,
            unidadId: inv.unidadId!,
            numeroFactura: `FAC-${periodo}-${String(i + bi + 1).padStart(4, "0")}`,
            numeroInterno: inv.numeroInterno,
            periodo,
            periodoLabel: inv.periodoLabel,
            residenteNombre: inv.residenteNombre,
            apto: inv.apto,
            vrAdmon: inv.vrAdmon,
            lineas: inv.lineas,
            saldoAFavor: inv.saldoAFavor,
            totalAPagar: inv.totalAPagar,
            totalConDescuento: inv.totalConDescuento,
            fechaEmision: Date.now(),
            fechaVencimiento,
            estado: inv.totalAPagar < 0 ? ("saldo_a_favor" as const) : ("pendiente" as const),
            pdfUrl: inv.pdfUrl,
          })),
        });
        inserted += res.inserted;
        updated += res.updated;
        skipped += res.skipped ?? 0;
        if (res.conciliacion) {
          conciliacion.pagadas += res.conciliacion.pagadas;
          conciliacion.abonadas += res.conciliacion.abonadas;
          conciliacion.vencidas += res.conciliacion.vencidas;
        }
      } catch (e) {
        errors += batch.length;
      }
      setProgress({ done: Math.min(i + BATCH, matched.length), total: matched.length });
    }

    setResult({ inserted, updated, skipped, errors, conciliacion });
    setStep("done");
  }

  const matchedCount = invoices.filter((i) => i.matchStatus === "ok").length;
  const noMatchCount = invoices.filter((i) => i.matchStatus === "no-match").length;
  const twoPageCount = invoices.filter((i) => i.pageCount > 1).length;

  const footer =
    step === "done" ? (
      <Button size="sm" onClick={() => { close(); onDone(); }}>
        Ver facturas
      </Button>
    ) : step === "preview" ? (
      <>
        <Button variant="ghost" size="sm" onClick={close}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleInsert} disabled={matchedCount === 0}>
          Insertar {matchedCount} facturas
        </Button>
      </>
    ) : (
      <Button variant="ghost" size="sm" onClick={close}>
        Cerrar
      </Button>
    );

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden />
        Subir facturas
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Subir facturas"
        description="PDF con todas las facturas del período · se divide automáticamente"
        className="max-w-2xl"
        footer={footer}
      >
        {/* Step: idle / uploading */}
        {(step === "idle" || step === "uploading") && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">Período</label>
              <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                {["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 transition-colors hover:border-brand/40 hover:bg-accent/40"
            >
              {step === "uploading" ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
                  <p className="text-sm text-muted-foreground">Procesando PDF… puede tardar un momento</p>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm font-medium text-foreground">Haz clic para seleccionar el PDF</p>
                  <p className="text-xs text-muted-foreground">
                    PDF con todas las facturas · se detectan hojas de 1 o 2 páginas
                  </p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFile}
                disabled={step === "uploading"}
              />
            </div>
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center text-xs">
              <div>
                <p className="text-lg font-semibold tabular-nums text-foreground">{invoices.length}</p>
                <p className="text-muted-foreground">detectadas</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{matchedCount}</p>
                <p className="text-muted-foreground">con unidad</p>
              </div>
              <div>
                <p className={`text-lg font-semibold tabular-nums ${noMatchCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground/50"}`}>{noMatchCount}</p>
                <p className="text-muted-foreground">sin unidad</p>
              </div>
            </div>

            {twoPageCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {twoPageCount} factura{twoPageCount > 1 ? "s" : ""} de 2 páginas agrupadas automáticamente
              </div>
            )}

            {parseErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                <p className="mb-1 font-medium">Errores al parsear ({parseErrors.length} páginas):</p>
                {parseErrors.map((e, i) => (
                  <p key={i}>Páginas {e.pages.join(",")}: {e.error}</p>
                ))}
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={soloNuevas}
                onChange={(e) => setSoloNuevas(e.target.checked)}
                className="accent-brand"
              />
              <span className="font-medium text-foreground">Solo insertar facturas nuevas</span>
              <span className="text-muted-foreground">(omite las que ya existen)</span>
            </label>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Unidad</th>
                    <th className="px-3 py-2 font-medium">Residente</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv, idx) => (
                    <tr key={idx} className={inv.matchStatus === "no-match" ? "bg-red-500/5" : ""}>
                      <td className="px-3 py-1.5 font-mono font-medium text-foreground">{inv.unitIdentifier || "?"}</td>
                      <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">{inv.residenteNombre}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-foreground">{cop(inv.totalAPagar)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {inv.matchStatus === "ok" ? (
                          <CheckCircle className="inline h-3.5 w-3.5 text-emerald-500" aria-hidden />
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-red-500">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden /> sin unidad
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: inserting */}
        {step === "inserting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
            <p className="text-sm text-foreground">
              Insertando en Convex… {progress.done}/{progress.total}
            </p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-8 w-8 text-emerald-500" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">¡Facturas cargadas!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.inserted} nuevas
                {result.updated > 0 && ` · ${result.updated} actualizadas`}
                {result.skipped > 0 && ` · ${result.skipped} omitidas`}
                {result.errors > 0 && ` · ${result.errors} errores`}
              </p>
            </div>

            {(result.conciliacion.pagadas > 0 || result.conciliacion.abonadas > 0 || result.conciliacion.vencidas > 0) && (
              <div className="w-full max-w-sm rounded-xl border border-border bg-muted/40 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conciliación automática del mes anterior
                </p>
                <div className="space-y-1.5 text-sm">
                  {result.conciliacion.pagadas > 0 && (
                    <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                      {result.conciliacion.pagadas} factura{result.conciliacion.pagadas === 1 ? "" : "s"} anterior{result.conciliacion.pagadas === 1 ? "" : "es"} marcada{result.conciliacion.pagadas === 1 ? "" : "s"} como pagada{result.conciliacion.pagadas === 1 ? "" : "s"}
                    </p>
                  )}
                  {result.conciliacion.abonadas > 0 && (
                    <p className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                      <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                      {result.conciliacion.abonadas} con abono parcial
                    </p>
                  )}
                  {result.conciliacion.vencidas > 0 && (
                    <p className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                      {result.conciliacion.vencidas} sin pago (vencida{result.conciliacion.vencidas === 1 ? "" : "s"})
                    </p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Según el saldo anterior que reporta cada factura nueva.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
