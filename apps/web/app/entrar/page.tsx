"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { api } from "@vekino/backend/api";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Entrada por enlace de un solo uso (el que llega por WhatsApp).
 *
 * La idea es que el residente no teclee NADA: se canjea el token, se inicia
 * sesión solo y cae en el dashboard. El formulario con los datos ya puestos
 * es el plan B — si el login automático falla, las credenciales no se pierden.
 *
 * Mismo sistema visual que `/login`: tokens `brand-*`, `heading`, `line`…,
 * y `force-light` para que el navegador no pinte los controles en oscuro
 * cuando el sistema lo está. Quien llega aquí viene de WhatsApp, no de la
 * app, y la transición debe sentirse continua con la web pública.
 */
export default function EntrarPage() {
  return (
    <div className="force-light flex min-h-svh flex-col items-center justify-center gap-8 bg-canvas px-6 py-10 sm:px-10">
      <Suspense fallback={<Tarjeta><Cargando texto="Preparando tu acceso…" /></Tarjeta>}>
        <Entrar />
      </Suspense>

      <div className="flex flex-col items-center gap-x-4 gap-y-1.5 text-[11.5px] text-placeholder sm:flex-row">
        <span>© {new Date().getFullYear()} Vekino</span>
        <span className="flex items-center gap-4">
          <Link
            href="/legal/privacidad"
            className="transition-colors hover:text-heading"
          >
            Privacidad
          </Link>
          <Link
            href="/legal/terminos"
            className="transition-colors hover:text-heading"
          >
            Términos
          </Link>
        </span>
      </div>
    </div>
  );
}

/* ── Estados de la pantalla ───────────────────────────────────────────────
 *  canjeando → se está pidiendo el canje del token
 *  entrando  → hay credenciales y se está iniciando sesión solo
 *  manual    → el login automático falló; se muestran los datos ya puestos
 *  invalido  → sin token, o el backend dijo que no
 */
type Estado = "canjeando" | "entrando" | "manual" | "invalido";

function Entrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? "";
  const canjearAcceso = useMutation(api.credenciales.canjearAcceso);

  const [estado, setEstado] = useState<Estado>("canjeando");
  const [motivo, setMotivo] = useState<string>(
    "Este enlace no es válido. Puede que se haya cortado al copiarlo.",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* El token es de un solo uso: la primera llamada lo borra. Este `ref` es
   * lo que impide que el doble render de StrictMode en desarrollo lo queme
   * antes de tiempo — se marca ANTES del primer `await`, no después. */
  const canjeado = useRef(false);

  useEffect(() => {
    if (canjeado.current) return;
    canjeado.current = true;

    if (!token) {
      setEstado("invalido");
      return;
    }

    void (async () => {
      let credenciales: { email: string; password: string };

      try {
        const res = await canjearAcceso({ token });

        /* El token ya no sirve para nada, pero tampoco tiene por qué quedar
         * en la barra de direcciones, en el historial ni en el `Referer`. */
        router.replace("/entrar");

        if (!res.ok) {
          setMotivo(res.motivo);
          setEstado("invalido");
          return;
        }
        credenciales = { email: res.email, password: res.password };
      } catch {
        setMotivo(
          "No pudimos validar tu enlace. Revisa tu conexión e inténtalo de nuevo.",
        );
        setEstado("invalido");
        return;
      }

      // Se guardan antes de intentar entrar: si el login falla, siguen ahí.
      setEmail(credenciales.email);
      setPassword(credenciales.password);
      setEstado("entrando");

      try {
        const { error: authError } = await authClient.signIn.email({
          email: credenciales.email,
          password: credenciales.password,
        });
        if (authError) {
          throw new Error(authError.message ?? "No se pudo iniciar sesión");
        }
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
        setEstado("manual");
      }
    })();
  }, [token, canjearAcceso, router]);

  /** Reintento manual: mismo flujo que el botón de `/login`. */
  async function reintentar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        throw new Error(authError.message ?? "Credenciales inválidas");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (estado === "canjeando" || estado === "entrando") {
    return (
      <Tarjeta>
        <Cargando
          texto={
            estado === "canjeando"
              ? "Preparando tu acceso…"
              : "Entrando a tu cuenta…"
          }
        />
      </Tarjeta>
    );
  }

  if (estado === "invalido") {
    return (
      <Tarjeta>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bad-soft">
            <AlertTriangle
              className="h-[21px] w-[21px] text-[#a83f3f]"
              strokeWidth={1.8}
              aria-hidden
            />
          </span>
          <h1 className="mt-4 text-[22px] font-[660] leading-tight tracking-[-0.03em] text-heading">
            Este enlace ya no sirve
          </h1>
          <p role="alert" className="mt-2 text-[14px] leading-[1.5] text-body">
            {motivo}
          </p>
        </div>

        <div className="mt-6">
          <Link
            href="/login"
            className={cn(
              "inline-flex h-12 w-full items-center justify-center rounded-btn bg-brand-500",
              "text-[14.5px] font-semibold text-white shadow-brand",
              "transition-[transform,background-color,box-shadow] duration-200 ease-out",
              "hover:-translate-y-0.5 hover:bg-brand-600 active:translate-y-0 active:scale-[0.985]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              "motion-reduce:transform-none motion-reduce:transition-none",
            )}
          >
            Ir a iniciar sesión
          </Link>
        </div>

        <LineaWhatsApp />
      </Tarjeta>
    );
  }

  // estado === "manual"
  return (
    <Tarjeta>
      <div className="text-center">
        <h1 className="text-[22px] font-[660] leading-tight tracking-[-0.03em] text-heading">
          Ya casi estás <span className="text-brand-500">adentro</span>
        </h1>
        <p className="mt-2 text-[14px] leading-[1.5] text-body">
          Dejamos tus datos puestos. Solo toca el botón para entrar.
        </p>
      </div>

      <form onSubmit={reintentar} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="entrar-correo"
            className="mb-[7px] block text-[13.5px] font-medium text-[#30302e]"
          >
            Correo electrónico
          </label>
          <input
            id="entrar-correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className={cn(CONTROL, "h-[46px]")}
          />
        </div>

        <div>
          <label
            htmlFor="entrar-password"
            className="mb-[7px] block text-[13.5px] font-medium text-[#30302e]"
          >
            Contraseña
          </label>
          <div className="relative">
            {/* Visible por defecto: la acaba de recibir por WhatsApp y no la
                sabe de memoria; ocultarla solo la haría desconfiar del campo. */}
            <input
              id="entrar-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={cn(CONTROL, "h-[46px] pr-11")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-btn text-subtle transition-colors hover:bg-[#f4f4f1] hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
            >
              {showPassword ? (
                <EyeOff className="h-[17px] w-[17px]" strokeWidth={1.8} />
              ) : (
                <Eye className="h-[17px] w-[17px]" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-btn border border-[#f2d4d4] bg-bad-soft px-3.5 py-2.5 text-[13px] leading-snug text-[#a83f3f]"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center rounded-btn bg-brand-500",
            "text-[14.5px] font-semibold text-white shadow-brand",
            "transition-[transform,background-color,box-shadow] duration-200 ease-out",
            "hover:-translate-y-0.5 hover:bg-brand-600 active:translate-y-0 active:scale-[0.985]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
            "disabled:pointer-events-none disabled:opacity-60",
            "motion-reduce:transform-none motion-reduce:transition-none",
          )}
        >
          {loading ? "Un momento…" : "Iniciar sesión"}
        </button>
      </form>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-subtle">
        Guarda esta contraseña: te sirve para entrar desde{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700"
        >
          la pantalla de siempre
        </Link>
        .
      </p>
    </Tarjeta>
  );
}

/* ── Piezas ────────────────────────────────────────────────────────────── */

/** Estilo compartido de inputs, el mismo control que `/login`. */
const CONTROL = cn(
  "w-full rounded-btn border border-[#deded9] bg-surface px-4 text-[14.5px] text-heading",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-placeholder",
  "focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/12",
);

/**
 * Marca + tarjeta. Todos los estados viven dentro del mismo contenedor para
 * que la pantalla no salte cuando el canje termina.
 */
function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[400px]">
      <Link
        href="/"
        className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500 shadow-[0_4px_12px_rgb(255_90_10/0.24)]">
          <Image
            src="/logos/isotipo-vekino.svg"
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] brightness-0 invert"
            priority
          />
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-heading">
          Vekino
        </span>
      </Link>

      <div className="rounded-panel border border-line bg-surface p-6 shadow-card sm:p-7">
        {children}
      </div>
    </div>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-6 w-6 text-brand-500" />
      <p className="text-[14.5px] font-medium text-heading">{texto}</p>
      <p className="text-[12.5px] text-subtle">Esto toma un segundo.</p>
    </div>
  );
}

/**
 * Salida de emergencia: los enlaces caducan a los 30 minutos y la forma de
 * pedir otro es el mismo WhatsApp por el que llegó. El número sale de Convex
 * (`whatsapp.contactoBot`); si no está configurado se degrada a texto.
 */
function LineaWhatsApp() {
  const contacto = useQuery(api.whatsapp.contactoBot, {});
  const telefono = contacto?.numero?.replace(/\D/g, "") ?? "";
  const mensaje = "Hola, necesito un nuevo enlace de acceso a Vekino.";

  return (
    <p className="mt-4 text-center text-[12.5px] leading-relaxed text-subtle">
      ¿Necesitas uno nuevo?{" "}
      {telefono ? (
        <a
          href={`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700"
        >
          Escríbenos por WhatsApp
        </a>
      ) : (
        <span className="font-semibold text-heading">
          Escríbenos al WhatsApp de Vekino
        </span>
      )}{" "}
      y te enviamos otro al instante.
    </p>
  );
}
