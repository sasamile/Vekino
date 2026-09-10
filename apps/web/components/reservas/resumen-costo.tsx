"use client";

import { calcularCosto, enPesos, type Tarifa } from "@vekino/backend/costoReserva";
import { cn } from "@/lib/utils";

/**
 * Lo que vale la reserva, antes de confirmarla.
 *
 * Vive aquí y no dentro de un formulario porque hay dos: el del residente y
 * el de la administración. Estaban escritos por separado y sólo el primero
 * mostraba precios, así que quien administra creaba reservas a ciegas —sin
 * ver la tarifa ni el depósito que después iba a cobrar—. Un único bloque
 * para los dos evita que vuelvan a desviarse.
 *
 * No decide nada: la cuenta la hace `calcularCosto`, la misma del backend.
 */
export function ResumenCosto({
  zona,
  horaInicio,
  horaFin,
  nota,
  className,
}: {
  /** La zona seleccionada, o `undefined` mientras no hay ninguna. */
  zona: Tarifa | undefined;
  horaInicio: string;
  horaFin: string;
  /**
   * Qué pasa con esa plata. Cambia según quién mira: al residente se le dice
   * cuándo va a pagar; a quien administra, que el cobro no se genera solo.
   */
  nota?: React.ReactNode;
  className?: string;
}) {
  if (!zona) return null;
  const costo = calcularCosto(zona, horaInicio, horaFin);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/40 p-3.5 text-sm",
        className,
      )}
    >
      {costo.sinTarifa && costo.deposito === 0 ? (
        <p className="text-muted-foreground">
          Este espacio no tiene tarifa configurada. Confirma el valor con la
          administración.
        </p>
      ) : (
        <>
          {costo.alquiler > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                Uso del espacio
                {costo.detalle ? (
                  <span className="ml-1 text-xs">({costo.detalle})</span>
                ) : null}
              </span>
              <span className="font-medium text-foreground">
                {enPesos(costo.alquiler)}
              </span>
            </div>
          )}
          {costo.deposito > 0 && (
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                Depósito
                {/* Se aclara que vuelve: si no, la reserva parece el doble de
                    cara y quien reserva desiste. */}
                <span className="ml-1 text-xs">(se devuelve)</span>
              </span>
              <span className="font-medium text-foreground">
                {enPesos(costo.deposito)}
              </span>
            </div>
          )}
          <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
            <span className="font-medium text-foreground">Total</span>
            <span className="text-base font-semibold text-foreground">
              {enPesos(costo.totalAPagar)}
            </span>
          </div>
          {nota && <p className="mt-2 text-xs text-muted-foreground">{nota}</p>}
        </>
      )}
    </div>
  );
}
