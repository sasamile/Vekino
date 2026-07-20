"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cop } from "@/lib/utils";

type EstadoMeta = {
  label: string;
  sub: string;
  icon: typeof Clock;
  tone: string;
};

const ESTADO_META: Record<string, EstadoMeta> = {
  aprobada: {
    label: "¡Pago aprobado!",
    sub: "Tu cuenta de administración quedó al día.",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  pendiente: {
    label: "Pago pendiente",
    sub: "Estamos confirmando tu pago con la entidad. Puede tardar unos minutos.",
    icon: Clock,
    tone: "text-amber-600 dark:text-amber-400",
  },
  iniciada: {
    label: "Pago en proceso",
    sub: "Estamos confirmando el resultado con la pasarela.",
    icon: Clock,
    tone: "text-amber-600 dark:text-amber-400",
  },
  rechazada: {
    label: "Pago rechazado",
    sub: "La entidad no aprobó la transacción. Puedes intentarlo de nuevo.",
    icon: XCircle,
    tone: "text-destructive",
  },
  fallida: {
    label: "Pago fallido",
    sub: "Ocurrió un problema al procesar el pago. Intenta de nuevo.",
    icon: XCircle,
    tone: "text-destructive",
  },
  expirada: {
    label: "Pago expirado",
    sub: "La transacción caducó. Puedes iniciar un nuevo pago.",
    icon: AlertTriangle,
    tone: "text-muted-foreground",
  },
  no_autorizada: {
    label: "Pago no autorizado",
    sub: "La transacción no fue autorizada. Intenta con otro medio de pago.",
    icon: XCircle,
    tone: "text-destructive",
  },
  error: {
    label: "No se pudo procesar",
    sub: "Hubo un error creando la transacción. Intenta de nuevo.",
    icon: AlertTriangle,
    tone: "text-destructive",
  },
};

const ESTADOS_FINALES = new Set([
  "aprobada",
  "rechazada",
  "fallida",
  "expirada",
  "no_autorizada",
  "error",
]);

export default function PagoRetorno() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      }
    >
      <Comprobante />
    </Suspense>
  );
}

function Comprobante() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const searchParams = useSearchParams();
  const pmtId = searchParams.get("pmtId") ?? "";

  const pago = useQuery(
    api.pagos.estadoPagoPorPmt,
    pmtId ? { pmtId } : "skip",
  );
  const verificar = useAction(api.pagos.verificarPago);
  const [verificando, setVerificando] = useState(false);

  // Reconsulta automática mientras el estado no sea final (cada 15s, máx ~5 min).
  const intentos = useRef(0);
  useEffect(() => {
    if (!pago || ESTADOS_FINALES.has(pago.estado)) return;
    if (intentos.current >= 20) return;
    const t = setInterval(async () => {
      intentos.current += 1;
      try {
        await verificar({ pagoId: pago._id });
      } catch {
        /* la query reactiva reflejará el cambio; ignoramos errores puntuales */
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [pago, verificar]);

  async function actualizarAhora() {
    if (!pago) return;
    setVerificando(true);
    try {
      await verificar({ pagoId: pago._id });
    } finally {
      setVerificando(false);
    }
  }

  const volver = `/mi/${condominioId}/cuenta`;

  return (
    <PageContainer className="max-w-lg space-y-6 py-10">
      {!pmtId ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-base font-semibold text-foreground">
            No encontramos la referencia del pago
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisa el estado en tu cuenta.
          </p>
          <VolverLink href={volver} />
        </Card>
      ) : pago === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : pago === null ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-base font-semibold text-foreground">
            Pago no encontrado
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Referencia {pmtId}. Verifica el estado en tu cuenta.
          </p>
          <VolverLink href={volver} />
        </Card>
      ) : (
        <EstadoCard
          estado={pago.estado}
          monto={pago.monto}
          medioPago={pago.medioPago}
          banco={pago.banco}
          pmtId={pmtId}
          volver={volver}
          onActualizar={actualizarAhora}
          verificando={verificando}
        />
      )}
    </PageContainer>
  );
}

function EstadoCard({
  estado,
  monto,
  medioPago,
  banco,
  pmtId,
  volver,
  onActualizar,
  verificando,
}: {
  estado: string;
  monto: number;
  medioPago?: string;
  banco?: string;
  pmtId: string;
  volver: string;
  onActualizar: () => void;
  verificando: boolean;
}) {
  const meta: EstadoMeta = ESTADO_META[estado] ?? {
    label: "Pago pendiente",
    sub: "Estamos confirmando tu pago con la entidad.",
    icon: Clock,
    tone: "text-amber-600 dark:text-amber-400",
  };
  const Icon = meta.icon;
  const esFinal = ESTADOS_FINALES.has(estado);

  return (
    <Card className="p-8 text-center">
      <Icon className={`mx-auto h-14 w-14 ${meta.tone}`} />
      <h1 className="mt-4 text-xl font-semibold text-foreground">{meta.label}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{meta.sub}</p>

      <dl className="mt-6 space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-left text-sm">
        <Row label="Valor" value={cop(monto)} />
        {medioPago && <Row label="Medio de pago" value={medioPago} />}
        {banco && <Row label="Banco" value={banco} />}
        <Row label="Referencia" value={pmtId} />
      </dl>

      <div className="mt-6 flex flex-col items-center gap-3">
        {!esFinal && (
          <button
            onClick={onActualizar}
            disabled={verificando}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${verificando ? "animate-spin" : ""}`}
            />
            Actualizar estado
          </button>
        )}
        <VolverLink href={volver} />
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function VolverLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      Volver a mi cuenta
    </Link>
  );
}
