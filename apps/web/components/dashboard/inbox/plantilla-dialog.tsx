"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { AlertTriangle, ArrowLeft, Loader2, Search, Send } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Plantilla = {
  nombre: string;
  idioma: string;
  categoria: string;
  cuerpo: string;
  variables: number;
  botonUrlDinamica: boolean;
};

/** `sin_barrera_v2` → `Sin barrera v2` */
function titulo(nombre: string) {
  const limpio = nombre.replace(/_/g, " ").trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Cuerpo con las variables reemplazadas por lo que se lleve escrito. Las que
 * siguen vacías se dejan como `{{n}}` para que se vea qué falta.
 */
function conValores(cuerpo: string, valores: string[]) {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (crudo, n) => {
    const v = valores[Number(n) - 1];
    return v && v.trim() ? v : crudo;
  });
}

/** El `*negrita*` y el `_cursiva_` de WhatsApp, para que la vista previa no mienta. */
function formatoWhatsApp(texto: string) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return partes.map((p, i) => {
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <strong key={i}>{p.slice(1, -1)}</strong>;
    }
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

/**
 * Selector de plantillas del inbox.
 *
 * Existe porque fuera de la ventana de 24 h una plantilla es lo ÚNICO que
 * WhatsApp deja mandar, y hasta ahora eso solo se podía hacer desde
 * Automatizaciones, a todo un condominio. Aquí se manda una sola, a esta
 * conversación, rellenando las variables a mano.
 */
export function PlantillaDialog({
  conversacionId,
  nombreContacto,
  abierto,
  onAbierto,
  onEnviada,
}: {
  conversacionId: Id<"waConversations">;
  /** Para proponer el nombre como primer valor: casi siempre es `{{1}}`. */
  nombreContacto: string;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  onEnviada?: () => void;
}) {
  const listar = useAction(api.automatizaciones.plantillasDisponibles);
  const enviarPlantilla = useAction(api.whatsappInbox.enviarPlantilla);

  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [elegida, setElegida] = useState<Plantilla | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [sufijo, setSufijo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Se piden a YCloud al abrir: son las aprobadas de verdad, no una copia
  // nuestra que se desactualiza cada vez que Meta rechaza o aprueba algo.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setErrorCarga(null);
    void listar({})
      .then((r) => vivo && setPlantillas(r))
      .catch((e) => vivo && setErrorCarga(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [abierto, listar]);

  // Cada vez que se vuelve a abrir se empieza limpio.
  useEffect(() => {
    if (abierto) return;
    setElegida(null);
    setValores([]);
    setSufijo("");
    setErrorEnvio(null);
    setBusqueda("");
  }, [abierto]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !plantillas) return plantillas ?? [];
    return plantillas.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || p.cuerpo.toLowerCase().includes(q),
    );
  }, [plantillas, busqueda]);

  function elegir(p: Plantilla) {
    setElegida(p);
    setErrorEnvio(null);
    // El primer nombre de pila suele ser {{1}}; se propone y se puede borrar.
    const iniciales = Array.from({ length: p.variables }, () => "");
    if (p.variables > 0) iniciales[0] = nombreContacto.split(" ")[0] ?? "";
    setValores(iniciales);
    setSufijo("");
  }

  const faltanValores =
    !!elegida &&
    (valores.slice(0, elegida.variables).some((v) => !v.trim()) ||
      (elegida.botonUrlDinamica && !sufijo.trim()));

  async function onEnviar() {
    if (!elegida || faltanValores || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await enviarPlantilla({
        conversacionId,
        plantilla: elegida.nombre,
        idioma: elegida.idioma,
        parametros: valores.slice(0, elegida.variables),
        sufijoUrl: elegida.botonUrlDinamica ? sufijo.trim() : undefined,
      });
      if (!r.ok) {
        setErrorEnvio(r.motivo ?? "No se pudo enviar.");
        return;
      }
      onAbierto(false);
      onEnviada?.();
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={() => onAbierto(false)}
      className="sm:max-w-lg"
      title={
        <span className="flex items-center gap-2">
          {elegida && (
            <button
              type="button"
              onClick={() => setElegida(null)}
              aria-label="Volver a la lista"
              className="-ml-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          )}
          {elegida ? titulo(elegida.nombre) : "Enviar una plantilla"}
        </span>
      }
      description={
        elegida
          ? "Completa los datos y revisa cómo le va a llegar."
          : "Solo salen las que Meta ya aprobó. Sirven aunque hayan pasado las 24 horas."
      }
      footer={
        elegida ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={() => void onEnviar()} disabled={faltanValores || enviando}>
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex max-h-[60dvh] min-h-0 flex-col">
        {/* ---- Lista ---- */}
        {!elegida && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative pb-3">
              <Search
                className="pointer-events-none absolute left-3 top-[18px] h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar plantilla…"
                className="pl-9"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {errorCarga && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                  {errorCarga}
                </p>
              )}

              {plantillas === null && !errorCarga && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cargando plantillas…
                </div>
              )}

              {plantillas !== null && filtradas.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busqueda.trim()
                    ? "Ninguna plantilla coincide."
                    : "Todavía no hay plantillas aprobadas."}
                </p>
              )}

              {filtradas.map((p) => (
                <button
                  key={`${p.nombre}:${p.idioma}`}
                  type="button"
                  onClick={() => elegir(p)}
                  className={cn(
                    "w-full rounded-xl border border-border bg-card p-3 text-left transition-colors",
                    "hover:border-ring/50 hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {titulo(p.nombre)}
                    </span>
                    {p.variables > 0 && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {p.variables} dato{p.variables > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                    {p.cuerpo}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Rellenar y previsualizar ---- */}
        {elegida && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {/* Vista previa: la burbuja verde, igual que en el hilo. */}
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Así le llega
              </p>
              <div className="max-w-[92%] rounded-2xl rounded-tr-md bg-emerald-100 px-3.5 py-2.5 dark:bg-emerald-500/15">
                <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                  {formatoWhatsApp(conValores(elegida.cuerpo, valores))}
                </p>
              </div>
            </div>

            {Array.from({ length: elegida.variables }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <label
                  htmlFor={`var-${i}`}
                  className="text-xs font-medium text-foreground"
                >
                  Dato {`{{${i + 1}}}`}
                </label>
                <Input
                  id={`var-${i}`}
                  value={valores[i] ?? ""}
                  onChange={(e) => {
                    const copia = [...valores];
                    copia[i] = e.target.value;
                    setValores(copia);
                    setErrorEnvio(null);
                  }}
                  placeholder={i === 0 ? "Nombre de la persona" : "Escribe el valor"}
                />
              </div>
            ))}

            {elegida.botonUrlDinamica && (
              <div className="space-y-1.5">
                <label htmlFor="sufijo" className="text-xs font-medium text-foreground">
                  Final del enlace del botón
                </label>
                <Input
                  id="sufijo"
                  value={sufijo}
                  onChange={(e) => {
                    setSufijo(e.target.value);
                    setErrorEnvio(null);
                  }}
                  placeholder="lo que va después del dominio"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Esta plantilla lleva un botón con enlace variable. Va solo el
                  pedazo final, sin el https:// ni el dominio.
                </p>
              </div>
            )}

            {errorEnvio && (
              <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-red-700 dark:text-red-400">
                  {errorEnvio}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
