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
      const msg = e instanceof Error ? e.message : "No se pudo iniciar el pago.";
      /* El servidor antepone su propio prefijo y agrega el id interno; al
       * residente solo le sirve lo que dice la pasarela. */
      setError(
        msg
          .replace(/^.*No se pudo crear el pago en la pasarela:\s*/, "")
          .replace(/\s*\(pagoId [^)]*\)\s*$/, "")
          .trim() || "No se pudo iniciar el pago. Intenta de nuevo.",
      );
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
