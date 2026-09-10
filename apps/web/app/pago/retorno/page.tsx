"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { api } from "@vekino/backend/api";

/**
 * Retorno de la pasarela cuando no se pudo resolver el condominio.
 *
 * Existe porque no existía: el endpoint `/aval/retorno` redirige aquí siempre
 * que no logra averiguar a qué conjunto pertenece la transacción —porque el
 * registro del pago se borró, o porque la transacción no es nuestra— y esta
 * ruta devolvía un 404.
 *
 * Un 404 después de pagar es lo peor que puede pasarle a alguien: no sabe si
 * el dinero salió, no tiene a quién preguntarle y la pantalla no dice nada.
 * Aunque no se pueda mostrar el detalle, hay que decirle qué pasó y darle
 * la referencia con la que reclamar.
 */
export default function RetornoGenerico() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Contenido />
    </Suspense>
  );
}

const ESTADOS = {
  aprobada: {
    Icono: CheckCircle2,
    color: "text-emerald-600",
    titulo: "Pago aprobado",
    texto: "Tu pago quedó registrado. Gracias.",
  },
  pendiente: {
    Icono: Clock,
    color: "text-amber-600",
    titulo: "Pago pendiente",
    texto:
      "Estamos confirmando tu pago con la entidad financiera. Puede tardar unos minutos.",
  },
  iniciada: {
    Icono: Clock,
    color: "text-amber-600",
    titulo: "Pago en proceso",
    texto:
      "Estamos confirmando tu pago con la entidad financiera. Puede tardar unos minutos.",
  },
  rechazada: {
    Icono: XCircle,
    color: "text-destructive",
    titulo: "Pago rechazado",
    texto: "Tu entidad financiera no autorizó la transacción.",
  },
  fallida: {
    Icono: XCircle,
    color: "text-destructive",
    titulo: "Pago no completado",
    texto: "La transacción no se completó. Puedes intentarlo de nuevo.",
  },
} as const;

function Contenido() {
  const params = useSearchParams();
  const pmtId = params.get("pmtId") ?? params.get("PmtId") ?? "";

  /* Sin pmtId no hay nada que consultar: la pasarela lo agrega siempre, así
   * que llegar sin él significa que alguien abrió la URL a mano. */
  const pago = useQuery(
    api.pagos.estadoPagoPorPmt,
    pminValido(pmtId) ? { pmtId } : "skip",
  );

  const estado = pago?.estado;
  const info = estado && estado in ESTADOS
    ? ESTADOS[estado as keyof typeof ESTADOS]
    : null;
  const Icono = info?.Icono ?? Clock;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        {/* El contenido se pinta SIEMPRE, sin esperar la consulta.
            La consulta exige sesión, y quien vuelve de la pasarela puede no
            tenerla —pagó desde otra pestaña, se le venció, entró desde el
            correo—. Bloquear la pantalla en un girador dejaba a esa persona
            mirando una rueda para siempre justo después de pagar. El detalle
            aparece si la consulta responde; si no, queda el mensaje y la
            referencia, que es lo que de verdad hace falta. */}
        <Icono className={`mx-auto h-12 w-12 ${info?.color ?? "text-muted-foreground"}`} />
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          {info?.titulo ?? "Transacción recibida"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {info?.texto ??
            "Registramos tu regreso desde la pasarela. Si el pago se completó, se verá reflejado en tu estado de cuenta en unos minutos."}
        </p>

        {pago && (
          <dl className="mt-5 space-y-1.5 rounded-xl bg-muted/50 p-4 text-left text-sm">
            <Fila etiqueta="Valor" valor={enPesos(pago.monto)} />
            {pago.medioPago && <Fila etiqueta="Medio de pago" valor={pago.medioPago} />}
            {pago.banco && <Fila etiqueta="Banco" valor={pago.banco} />}
          </dl>
        )}

        {/* La referencia va SIEMPRE, haya o no detalle: es lo único con lo
            que el residente puede reclamar si algo salió mal. */}
        {pmtId && (
          <p className="mt-4 text-xs text-muted-foreground">
            Referencia de la transacción:{" "}
            <span className="font-mono text-foreground">{pmtId}</span>
          </p>
        )}

        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
        >
          Volver a Vekino
        </Link>
      </div>
    </main>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium text-foreground">{valor}</dd>
    </div>
  );
}

/** La pasarela manda un identificador numérico; cualquier otra cosa es ruido. */
function pminValido(pmtId: string) {
  return /^\d{6,}$/.test(pmtId);
}

function enPesos(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}
