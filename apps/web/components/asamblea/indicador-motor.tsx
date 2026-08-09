"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Diagnostico } from "@/hooks/sala-tipos";

type Motor = "sfu" | "malla" | "cloudflare" | "cargando";

const ETIQUETAS: Record<Motor, { corto: string; largo: string }> = {
  cloudflare: {
    corto: "Cloudflare",
    largo: "El audio y el video pasan por el repetidor de Cloudflare.",
  },
  sfu: {
    corto: "Servidor propio",
    largo: "El audio y el video pasan por el servidor de medios de LiveKit.",
  },
  malla: {
    corto: "Punto a punto",
    largo:
      "Cada persona le manda su audio a cada una de las demás, sin repetidor. Sirve para grupos de unas decenas; no para una asamblea grande.",
  },
  cargando: { corto: "…", largo: "Decidiendo qué motor usar." },
};

/**
 * Qué motor está usando esta sala, y la prueba.
 *
 * Existe porque la pregunta «¿de verdad está usando Cloudflare?» no tenía
 * respuesta desde la pantalla, y no vale que la aplicación conteste sola: eso
 * es solo repetir qué motor CREE que eligió. Al abrirlo se le pregunta al
 * navegador por dónde están cruzando los bytes, que es un dato que el código
 * de la sala no puede inventarse.
 */
export function IndicadorMotor({
  motor,
  diagnostico,
  className,
}: {
  motor: Motor;
  diagnostico?: () => Promise<Diagnostico | null>;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(false);

  const consultar = useCallback(async () => {
    if (!diagnostico) return;
    setCargando(true);
    try {
      setDatos(await diagnostico());
    } finally {
      setCargando(false);
    }
  }, [diagnostico]);

  /* Mientras el panel está abierto se refresca solo: lo que convence no es la
   * dirección del otro extremo, es ver los bytes subir en vivo. */
  useEffect(() => {
    if (!abierto) return;
    void consultar();
    const id = setInterval(() => void consultar(), 2000);
    return () => clearInterval(id);
  }, [abierto, consultar]);

  const etiqueta = ETIQUETAS[motor];
  const esCloudflare = motor === "cloudflare";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={!diagnostico}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
          esCloudflare
            ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
            : motor === "malla"
              ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              : "bg-white/10 text-white/70 hover:bg-white/20",
          !diagnostico && "cursor-default",
        )}
        title={etiqueta.largo}
      >
        <Radio className="h-3 w-3" aria-hidden />
        {etiqueta.corto}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[19rem] rounded-xl border border-white/10 bg-neutral-900/95 p-3.5 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-white">
              Motor de la sala
            </p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded p-0.5 text-white/40 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-white/60">
            {etiqueta.largo}
          </p>

          {!datos && cargando && (
            <p className="flex items-center gap-1.5 text-[11px] text-white/50">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Preguntándole al navegador…
            </p>
          )}

          {datos && (
            <div className="space-y-2">
              {/* La afirmación que importa, y de dónde sale. */}
              {datos.esDeCloudflare !== null && (
                <div
                  className={cn(
                    "flex gap-2 rounded-lg px-2.5 py-2",
                    datos.esDeCloudflare
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-amber-500/10 text-amber-300",
                  )}
                >
                  {datos.esDeCloudflare ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <p className="text-[11px] leading-relaxed">
                    {datos.esDeCloudflare
                      ? `Los medios están viajando a ${datos.ipRemota}, que es una dirección de Cloudflare.`
                      : `El otro extremo es ${datos.ipRemota}, que NO figura en los rangos de Cloudflare.`}
                  </p>
                </div>
              )}

              <Dato etiqueta="Conexión" valor={datos.estadoConexion} />
              <Dato
                etiqueta="Recibido"
                valor={formatearBytes(datos.bytesRecibidos)}
              />
              <Dato
                etiqueta="Enviado"
                valor={formatearBytes(datos.bytesEnviados)}
              />
              <Dato
                etiqueta="Pistas"
                valor={`${datos.pistasPublicadas} emitiendo · ${datos.pistasSuscritas} recibiendo`}
              />
              {datos.sessionId && (
                <Dato
                  etiqueta="Sesión"
                  valor={datos.sessionId.slice(0, 16) + "…"}
                />
              )}

              <p className="pt-1 text-[10px] leading-relaxed text-white/35">
                Estos números los da el navegador, no la aplicación. Si suben
                mientras alguien habla, el audio está pasando por ahí de verdad.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-white/45">{etiqueta}</span>
      <span className="font-mono text-[11px] text-white/85">{valor}</span>
    </div>
  );
}

function formatearBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
