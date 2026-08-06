"use client";

import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { cn } from "@/lib/utils";

/**
 * Botón flotante para hablar con el bot de WhatsApp de Vekino.
 *
 * Desde ahí el residente/administrador resuelve lo cotidiano sin entrar a la
 * app: consultar su factura, reservar, mandar el comprobante de pago, pedir
 * sus datos de acceso o reportar un problema.
 *
 * Solo aparece si el condominio tiene el módulo "whatsapp" encendido (lo
 * decide el backend en `whatsapp.contactoBot`): un botón que lleva a un bot
 * que va a contestar "no está habilitado" es peor que no tener botón.
 */

const MENSAJE = "Hola, necesito ayuda con Vekino";

/**
 * Breakpoint en el que DESAPARECE la barra de navegación inferior del shell.
 * Por debajo de ese ancho el botón se sube para no quedar tapado.
 *
 * - `"none"`: el shell no tiene barra inferior (condominio, portal hoy).
 * - `"md"`  : barra inferior con `md:hidden` (patrón de `portal-bottom-nav`).
 * - `"lg"`  : barra inferior con `lg:hidden` (guardia).
 */
type BottomNav = "none" | "md" | "lg";

/**
 * Las barras inferiores del repo miden `h-16` (4rem) y se pintan pegadas a
 * `bottom-0` SIN padding de safe area, o sea que ya cubren el home indicator
 * de iOS. Por eso, cuando hay barra, el offset es 4rem + 1rem de aire y no
 * hace falta sumarle `env(safe-area-inset-bottom)`; cuando no la hay, sí.
 */
const POSICION: Record<BottomNav, string> = {
  none: "bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))]",
  md: "bottom-20 md:bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))]",
  lg: "bottom-20 lg:bottom-[calc(1.25rem_+_env(safe-area-inset-bottom))]",
};

export function WhatsappFab({
  condominioId,
  bottomNav = "none",
  className,
}: {
  condominioId?: Id<"condominios">;
  bottomNav?: BottomNav;
  className?: string;
}) {
  // Sin condominio no hay módulo que consultar y `habilitado` sería false de
  // todas formas: nos ahorramos la query.
  const contacto = useQuery(
    api.whatsapp.contactoBot,
    condominioId ? { condominioId } : "skip",
  );

  // Cargando, sin número configurado o módulo apagado: no se pinta nada.
  if (!contacto?.numero || !contacto.habilitado) return null;

  const href = `https://wa.me/${contacto.numero}?text=${encodeURIComponent(
    MENSAJE,
  )}`;

  return (
    // El contenedor no captura el puntero: solo el círculo es clicable, para
    // que la etiqueta (invisible en reposo) no robe clics al contenido.
    // `flex-row-reverse` deja el círculo a la derecha manteniéndolo primero en
    // el DOM, que es lo que permite el `peer-hover` de la etiqueta.
    <div
      className={cn(
        "pointer-events-none fixed z-40 flex flex-row-reverse items-center gap-2.5",
        "right-[calc(1.25rem_+_env(safe-area-inset-right))]",
        POSICION[bottomNav],
        className,
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escribir a Vekino por WhatsApp"
        title="¿Ayuda por WhatsApp?"
        className={cn(
          "peer pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full",
          "bg-[#25D366] text-white shadow-floating",
          "transition-transform duration-200 ease-out hover:scale-105 active:scale-95",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E]",
          "motion-reduce:transition-none motion-reduce:hover:scale-100",
        )}
      >
        <WhatsappGlifo className="h-7 w-7" />
      </a>

      {/* Etiqueta al pasar el mouse (solo de md hacia arriba: en móvil no hay
          hover y sobraría espacio ocupado). */}
      <span
        aria-hidden
        className={cn(
          "hidden select-none whitespace-nowrap rounded-full md:block",
          "border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground shadow-soft",
          "translate-x-1 opacity-0 transition duration-200 ease-out",
          "peer-hover:translate-x-0 peer-hover:opacity-100",
          "peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100",
          "motion-reduce:transition-none",
        )}
      >
        ¿Ayuda por WhatsApp?
      </span>
    </div>
  );
}

/** Glifo oficial de WhatsApp (lucide no lo trae). */
function WhatsappGlifo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
