"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Check, KeyRound, ShieldCheck, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

/**
 * Marca de "ya lo cerré" por usuario y por sesión del navegador: al navegar
 * entre páginas no reaparece, pero en el próximo login sí (sessionStorage se
 * limpia al cerrar la pestaña). La clave incluye el usuario para que otra
 * persona que entre en la misma pestaña sí vea el aviso.
 */
const STORAGE_PREFIX = "vekino:clave-temporal-omitida:";

const MIN_LEN = 8;

/**
 * Convex antepone "[CONVEX A(...)][Request ID: ...] Server Error Uncaught
 * Error:" y añade la traza al final. Nada de eso le sirve al residente.
 */
function mensajeLimpio(err: unknown): string {
  const crudo = err instanceof Error ? err.message : String(err ?? "");
  const m = crudo.match(/Uncaught Error:\s*([^\n]*)/);
  const texto = (m?.[1] ?? crudo).split(" at handler")[0]!.trim();
  return texto || "No se pudo cambiar la contraseña.";
}

function leerOmitido(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

function guardarOmitido(userId: string) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + userId, "1");
  } catch {
    // Modo privado / storage bloqueado: se vuelve a mostrar, no pasa nada.
  }
}

/**
 * Aviso NO bloqueante para quien sigue usando la contraseña que le envió la
 * administración. Se puede cerrar (X, "Ahora no" o Escape) y seguir usando la
 * plataforma con esa misma clave; vuelve a aparecer en la próxima sesión hasta
 * que la cambie.
 */
export function CambiarClaveTemporalModal() {
  const me = useQuery(api.users.me);
  const cambiarPassword = useAction(api.users.cambiarMiPassword);

  const userId = me?.id ?? null;
  const debeMostrar = me?.claveTemporal === true;

  // Arranca oculto: evita el parpadeo antes de leer sessionStorage.
  const [cerrado, setCerrado] = useState(true);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [enviandoEnlace, setEnviandoEnlace] = useState(false);
  const [enlaceMsg, setEnlaceMsg] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId || !debeMostrar) return;
    setCerrado(leerOmitido(userId));
  }, [userId, debeMostrar]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  /** Cierre manual: recuerda la omisión para el resto de esta sesión. */
  const posponer = useCallback(() => {
    if (busy) return;
    if (userId) guardarOmitido(userId);
    setCerrado(true);
  }, [busy, userId]);

  const abierto = debeMostrar && !cerrado;

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      posponer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, posponer]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!actual) {
      setError("Escribe tu contraseña actual.");
      return;
    }
    if (nueva.trim().length < MIN_LEN) {
      setError(`La nueva contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await cambiarPassword({ actual, nueva });
      setExito(true);
      setActual("");
      setNueva("");
      setConfirmar("");
      // Breve confirmación; luego se cierra (y `me.claveTemporal` ya es false).
      timerRef.current = window.setTimeout(() => setCerrado(true), 1800);
    } catch (err) {
      setError(mensajeLimpio(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Salida para quien no conoce su contraseña real.
   *
   * Muchos residentes recibieron una clave temporal que en realidad era la
   * clave maestra de soporte: entran con ella, pero no es la contraseña de su
   * cuenta, así que "contraseña actual" nunca coincide. El enlace por correo
   * les deja fijar una propia sin depender de eso.
   */
  async function pedirEnlace() {
    if (!me?.email) return;
    setError(null);
    setEnlaceMsg(null);
    setEnviandoEnlace(true);
    try {
      await authClient.requestPasswordReset({
        email: me.email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setEnlaceMsg(
        "Te enviamos un enlace a tu correo para que crees una contraseña nueva. Revisa también la carpeta de spam.",
      );
    } catch {
      setEnlaceMsg(
        "No pudimos enviar el enlace. Escríbele a la administración de tu conjunto.",
      );
    } finally {
      setEnviandoEnlace(false);
    }
  }

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={posponer}
    >
      <div
        role="dialog"
        aria-labelledby="clave-temporal-title"
        aria-describedby="clave-temporal-desc"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10">
              <KeyRound className="h-4.5 w-4.5 text-brand" aria-hidden />
            </span>
            <h2
              id="clave-temporal-title"
              className="text-lg font-semibold text-foreground"
            >
              Cambia tu contraseña
            </h2>
          </div>
          <button
            type="button"
            onClick={posponer}
            disabled={busy}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p id="clave-temporal-desc" className="mt-3 text-sm text-muted-foreground">
          Estás usando la contraseña temporal que te envió la administración.
          Por seguridad te recomendamos cambiarla por una sola tuya.
        </p>

        {exito ? (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-400">
              Contraseña actualizada. Úsala la próxima vez que ingreses.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                No es obligatorio ahora: puedes cerrar esta ventana y seguir
                usando la plataforma con la misma contraseña. Te lo volveremos a
                recordar más adelante.
              </p>
            </div>

            <form onSubmit={guardar} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="clave-temporal-actual"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Contraseña actual
                </label>
                <Input
                  id="clave-temporal-actual"
                  type="password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="La que te enviaron por correo"
                  autoComplete="current-password"
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="clave-temporal-nueva"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Nueva contraseña
                </label>
                <Input
                  id="clave-temporal-nueva"
                  type="password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  placeholder={`Mínimo ${MIN_LEN} caracteres`}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>

              <div>
                <label
                  htmlFor="clave-temporal-confirmar"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Confirmar nueva contraseña
                </label>
                <Input
                  id="clave-temporal-confirmar"
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>

              {error && (
                <div className="space-y-1.5" role="alert">
                  <p className="text-sm text-red-600">{error}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    ¿La clave que te enviaron no funciona aquí? Puede que sea
                    una clave de acceso temporal y no la contraseña de tu
                    cuenta. Crea una nueva desde tu correo:
                  </p>
                  <button
                    type="button"
                    onClick={pedirEnlace}
                    disabled={enviandoEnlace}
                    className="text-xs font-medium text-brand underline underline-offset-2 disabled:opacity-50"
                  >
                    {enviandoEnlace
                      ? "Enviando enlace…"
                      : "Enviarme un enlace a mi correo"}
                  </button>
                </div>
              )}

              {enlaceMsg && (
                <p className="text-sm text-emerald-600" role="status">
                  {enlaceMsg}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={posponer}
                  disabled={busy}
                >
                  Ahora no
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  className="flex-1"
                  disabled={busy || !actual || !nueva || !confirmar}
                >
                  {busy ? (
                    <Spinner className="h-4 w-4 text-brand-foreground" />
                  ) : (
                    "Cambiar contraseña"
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
