"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { Loader2, Plus, FileText, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { uploadToS3 } from "@/lib/upload-s3";

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultVencimiento() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
  return d.toISOString().slice(0, 10);
}

function unidadLabel(u: {
  numero: string;
  torre: string | null;
  residentes: { name: string | null }[];
}) {
  const apto = u.torre ? `${u.numero} ${u.torre}` : u.numero;
  const nombre = u.residentes.find((r) => r.name)?.name;
  return nombre ? `${apto} · ${nombre}` : apto;
}

export function CreateFacturaForm({
  condominioId,
  defaultPeriodo,
}: {
  condominioId: Id<"condominios">;
  defaultPeriodo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [unidadId, setUnidadId] = useState("");
  const [periodo, setPeriodo] = useState(defaultPeriodo ?? currentPeriodo());
  const [fechaVencimiento, setFechaVencimiento] = useState(defaultVencimiento());
  const [valor, setValor] = useState("");
  const [saldoAFavor, setSaldoAFavor] = useState("0");
  const [totalConDescuento, setTotalConDescuento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const unidades = useQuery(
    api.unidades.listDetailed,
    open ? { condominioId } : "skip",
  );
  const createManual = useMutation(api.facturas.createManual);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);

  const sortedUnidades = useMemo(() => {
    return [...(unidades ?? [])].sort((a, b) =>
      a.numero.localeCompare(b.numero, undefined, { numeric: true }),
    );
  }, [unidades]);

  function reset() {
    setUnidadId("");
    setPeriodo(defaultPeriodo ?? currentPeriodo());
    setFechaVencimiento(defaultVencimiento());
    setValor("");
    setSaldoAFavor("0");
    setTotalConDescuento("");
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!unidadId) {
      setError("Selecciona una unidad.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      setError("El período debe ser YYYY-MM.");
      return;
    }
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      setError("Ingresa un valor válido.");
      return;
    }
    if (!fechaVencimiento) {
      setError("La fecha de vencimiento es requerida.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let pdfUrl: string | undefined;
      if (file) {
        const uploaded = await uploadToS3(
          generateUploadUrl,
          file,
          `condominios/facturas/${condominioId}`,
        );
        pdfUrl = uploaded.url;
      }

      const saldo = Number(saldoAFavor) || 0;
      const desc = totalConDescuento.trim()
        ? Number(totalConDescuento)
        : undefined;
      if (desc !== undefined && (!Number.isFinite(desc) || desc < 0)) {
        throw new Error("Valor con descuento inválido.");
      }

      const venc = new Date(`${fechaVencimiento}T23:59:59`);
      await createManual({
        condominioId,
        unidadId: unidadId as Id<"unidades">,
        periodo,
        fechaVencimiento: venc.getTime(),
        valor: valorNum,
        saldoAFavor: saldo,
        totalConDescuento: desc,
        pdfUrl,
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear factura");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Crear factura
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Crear Nueva Factura"
        description="Completa el formulario para crear una factura puntual"
        className="max-w-xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="create-factura-form" variant="brand" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Creando…
                </>
              ) : (
                "Crear Factura"
              )}
            </Button>
          </>
        }
      >
        <form id="create-factura-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Unidad *</label>
            <Select
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              required
            >
              <option value="">Selecciona una unidad</option>
              {sortedUnidades.map((u) => (
                <option key={u._id} value={u._id}>
                  {unidadLabel(u)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Período * (YYYY-MM)
              </label>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Fecha de vencimiento *
              </label>
              <Input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Valor (sin descuento) *
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej: 360000"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Saldo a favor (opcional)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={saldoAFavor}
              onChange={(e) => setSaldoAFavor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Valor con descuento (opcional)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={totalConDescuento}
              onChange={(e) => setTotalConDescuento(e.target.value)}
              placeholder="Ej: 140000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              PDF o imagen (opcional)
            </label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {file ? (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Quitar archivo"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {file ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {file.name}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
