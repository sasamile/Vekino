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

  async function pagar() {
    if (avalPortalUrl) {
      window.open(avalPortalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    try {
      const { redirectUrl } = await crearPago({ facturaId });
      window.location.href = redirectUrl;
    } catch {
      setLoading(false);
    }
  }

  return (
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
  );
}

export type { FacturaPay };
