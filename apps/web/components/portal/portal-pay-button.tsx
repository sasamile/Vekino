"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type FacturaPay = {
  _id: Id<"facturas">;
};

/**
 * Paga una factura: portal Aval del condo o checkout Aval por API.
 * Usa el color de marca del condominio (--brand).
 */

/**
 * Traduce el error a algo que le sirva a quien está pagando.
 *
 * Lo que llega es un ladrillo: el prefijo de Convex, el id de la petición,
 * el texto de la pasarela, el id interno del pago y el stack. Y el texto de
 * Aval, además de larguísimo, trae los teléfonos y correos de SU soporte
 * —en QA, los de un proveedor externo—. Nada de eso le sirve a un residente
 * y varias cosas no deberían siquiera mostrársele.
 *
 * Se reconocen las situaciones que de verdad ocurren y se dice qué hacer.
 * Para lo demás queda un mensaje corto y honesto: no adivinar es preferible
 * a inventar una causa.
 */
function mensajeParaElResidente(e: unknown): string {
  const crudo = e instanceof Error ? e.message : String(e ?? "");

  // Ya hay una transacción abierta para esta factura (código 27 de Aval).
  if (/PENDIENTE de recibir confirmaci/i.test(crudo)) {
    return "Ya tienes un pago en proceso para esta factura. Espera unos minutos y vuelve a intentarlo.";
  }
  if (/ya está pagada/i.test(crudo)) {
    return "Esta factura ya figura como pagada.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(crudo)) {
    return "No hay conexión con la pasarela. Revisa tu internet e intenta de nuevo.";
  }

  /* Cualquier otra cosa: se recorta a lo que dijo la pasarela, sin el
   * envoltorio técnico ni el stack. */
  const limpio = crudo
    .replace(/^[\s\S]*?en la pasarela:\s*/i, "")
    .replace(/\s*\(pagoId[\s\S]*$/i, "")
    .replace(/\s*at [A-Za-z]+[\s\S]*$/i, "")
    .trim();

  if (!limpio || limpio.length > 160 || /Convex|Request ID|Server Error/i.test(limpio)) {
    return "No se pudo iniciar el pago. Intenta de nuevo en unos minutos.";
  }
  return limpio;
}

export function PortalPayButton({
  facturaId,
  avalPortalUrl,
  label = "Pagar ahora",
  size = "default",
  variant = "brand",
  className,
  showArrow = false,
}: {
  facturaId: Id<"facturas">;
  avalPortalUrl?: string | null;
  label?: string;
  size?: "default" | "sm";
  variant?: "brand" | "outline";
  className?: string;
  showArrow?: boolean;
}) {
  const crearPago = useAction(api.pagos.crearPagoFactura);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pagar() {
    if (avalPortalUrl) {
      window.open(avalPortalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { redirectUrl } = await crearPago({ facturaId });
      window.location.href = redirectUrl;
    } catch (e) {
      /* Antes esto era `catch { setLoading(false) }`: el botón dejaba de
       * girar y no pasaba NADA. El residente vuelve a tocar, y otra vez
       * nada. La pasarela sí estaba respondiendo —y con un motivo claro—
       * pero el mensaje moría aquí.
       *
       * Un pago que falla en silencio es peor que uno que falla: la persona
       * no sabe si pagó, si debe reintentar, ni a quién preguntarle. */
      setError(mensajeParaElResidente(e));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={pagar}
        disabled={loading}
        className={cn("min-h-11 gap-2 px-4 text-[15px]", className)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {label}
            {showArrow ? <ArrowRight className="h-4 w-4" /> : null}
          </>
        )}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-[12px] leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export type { FacturaPay };
