import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Las capturas del teléfono vienen con el fondo gris del generador pegado en
 * el PNG (no hay transparencia). Este componente recorta ese fondo por CSS:
 * el wrapper mide exactamente el bounding box del teléfono y la imagen se
 * desplaza dentro con `overflow: hidden`.
 *
 * Los porcentajes salen de medir los píxeles reales de cada PNG (ver
 * README). Si se reemplaza una captura hay que volver a medirla.
 */
/* Medidas del BISEL del teléfono (píxeles casi negros), no del contenido:
 * la primera medición incluía la sombra difuminada y el fondo se colaba por
 * los costados. */
const CROPS = {
  "mobile-dashboard": {
    src: "/landing/mobile-dashboard.png",
    alt: "Aplicación móvil de Vekino mostrando la pantalla de inicio del residente",
    w: 1086,
    h: 1448,
    l: 0.1961,
    t: 0.0269,
    r: 0.8048,
    b: 0.9765,
  },
  "mobile-facturas": {
    src: "/landing/mobile-facturas.png",
    alt: "Pantalla de facturas de la app de Vekino con los estados pendiente, abonada, vencida y pagada",
    w: 941,
    h: 1672,
    l: 0.118,
    t: 0.0323,
    r: 0.881,
    b: 0.9713,
  },
} as const;

export type PhoneShot = keyof typeof CROPS;

export function CroppedPhone({
  name,
  className,
  sizes,
  priority,
}: {
  name: PhoneShot;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const c = CROPS[name];
  const rw = c.r - c.l;
  const rh = c.b - c.t;
  const aspect = (rw * c.w) / (rh * c.h);
  // Radio del bisel ≈ 13% del ancho del teléfono. En porcentaje escala con
  // cualquier tamaño de render; la parte vertical se corrige por el aspecto.
  const radio = `13% / ${(13 * aspect).toFixed(2)}%`;

  return (
    <span
      className={cn("relative block overflow-hidden", className)}
      style={{
        aspectRatio: `${Math.round(rw * c.w)} / ${Math.round(rh * c.h)}`,
        borderRadius: radio,
      }}
    >
      <Image
        src={c.src}
        alt={c.alt}
        width={c.w}
        height={c.h}
        priority={priority}
        sizes={sizes}
        className="absolute h-auto max-w-none"
        style={{
          width: `${100 / rw}%`,
          left: `${(-c.l / rw) * 100}%`,
          top: `${(-c.t / rh) * 100}%`,
        }}
      />
    </span>
  );
}
