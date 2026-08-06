"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { WhatsAppFlotante } from "@/components/whatsapp-flotante";
import { cn } from "@/lib/utils";

/** El botón de Apple en web requiere un Services ID + client secret de Apple.
 *  Mientras no esté configurado se oculta para no mostrar un botón que falla. */
const APPLE_WEB_ENABLED = process.env.NEXT_PUBLIC_APPLE_WEB_LOGIN === "1";

/**
 * Login en dos columnas: a la izquierda el acceso, a la derecha una imagen
 * del producto. Mismo sistema visual que la landing (tokens `brand-*`,
 * `heading`, `line`…), no el tema claro/oscuro de la app: quien llega aquí
 * viene de la web pública y la transición debe ser continua.
 *
 * `force-light` fija `color-scheme: light` — sin eso, el navegador pinta los
 * controles nativos en oscuro si el sistema lo está.
 */
export default function LoginPage() {
  return (
    /* En escritorio la pantalla se fija al viewport (`lg:h-svh` + recorte):
     * un login que scrollea se siente roto. En móvil NO se fija — con el
     * teclado abierto la altura visible se parte a la mitad y recortar
     * dejaría el botón fuera de alcance. */
    /* `grid-rows-[minmax(0,1fr)]` es lo que fija la altura de verdad: una
     * fila `auto` crece con la columna más alta —la del panel— y empujaba el
     * formulario fuera de la pantalla. El `minmax(0,…)` le permite encogerse
     * por debajo del contenido; el recorte lo hace cada columna. */
    <div className="force-light grid min-h-svh bg-canvas lg:h-svh lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      {/* ── Columna de acceso ─────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-7 xl:px-20">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
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

        {/* `min-h-0` + `overflow-y-auto`: si la pantalla es muy baja, el que
            scrollea es este bloque y no la página entera, así el logo y el
            pie legal se quedan siempre visibles. */}
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 lg:overflow-y-auto">
          <div className="w-full max-w-[400px]">
            {/* Formulario desde el primer paint: sin skeleton ni pantalla vacía. */}
            <AuthLoading>
              <LoginPanel />
            </AuthLoading>
            <Unauthenticated>
              <LoginPanel />
            </Unauthenticated>
            <Authenticated>
              <RedirectToDashboard />
            </Authenticated>
          </div>
        </div>

        <div className="flex flex-col items-center gap-x-4 gap-y-1.5 text-[11.5px] text-placeholder sm:flex-row sm:justify-between">
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
            <Link href="/" className="transition-colors hover:text-heading">
              Inicio
            </Link>
          </span>
        </div>
      </div>

      {/* ── Vista del producto ───────────────────────────────────────────
          Solo la imagen, a sangre dentro del panel. `fill` + `object-cover`
          la hacen cubrir la altura de la pantalla sea cual sea; el marco
          cálido de debajo solo asoma si la imagen no llega a los bordes. */}
      <div className="hidden p-3 lg:block">
        <div className="relative h-full w-full overflow-hidden rounded-panel border border-line bg-surface-warm">
          <Image
            src="/login/dashboard-preview-naranja.png"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover object-center"
            aria-hidden
          />
        </div>
      </div>

      <WhatsAppFlotante />
    </div>
  );
}

function RedirectToDashboard() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}

function LoginPanel() {
  const router = useRouter();
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw new Error(error.message ?? "Credenciales inválidas");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        throw new Error(
          error.message ??
            "No se pudo enviar el enlace. Contacta al administrador.",
        );
      }
      setSuccess(
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithSocial(provider: "google" | "apple") {
    if (loading) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/dashboard`,
      });
      if (error) {
        throw new Error(
          error.message ??
            `No se pudo iniciar con ${provider === "google" ? "Google" : "Apple"}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  const forgot = view === "forgot";

  function volver() {
    setView("signin");
    setError(null);
    setSuccess(null);
  }

  return (
    <div>
      {forgot ? (
        <button
          type="button"
          onClick={volver}
          className="mb-5 -ml-2 flex h-9 items-center gap-1.5 rounded-btn px-2 text-[13px] font-medium text-body transition-colors hover:bg-[#f4f4f1] hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Volver
        </button>
      ) : null}

      <h1 className="text-[clamp(1.85rem,3.4vw,2.35rem)] font-[660] leading-[1.05] tracking-[-0.04em] text-heading">
        {forgot ? (
          "Recuperar acceso"
        ) : (
          <>
            Bienvenido de <span className="text-brand-500">vuelta</span>
          </>
        )}
      </h1>
      <p className="mt-2.5 text-[14px] leading-[1.5] text-body">
        {forgot
          ? "Te enviaremos un enlace a tu correo para crear una contraseña nueva."
          : "Entra a la plataforma de tu conjunto residencial."}
      </p>

      {/* Tarjeta de acceso */}
      <div className="mt-6 rounded-panel border border-line bg-surface p-5 shadow-card">
        {forgot ? (
          <form onSubmit={submitForgot} className="space-y-4">
            <Campo
              id="correo-recuperar"
              label="Correo electrónico"
              value={email}
              onChange={setEmail}
              placeholder="tu@correo.com"
              type="email"
              autoComplete="email"
            />

            {error ? <Alerta tono="error">{error}</Alerta> : null}
            {success ? <Alerta tono="ok">{success}</Alerta> : null}

            <BotonPrimario loading={loading}>Enviar enlace</BotonPrimario>
          </form>
        ) : (
          <>
            {/* Acceso social primero: es un clic contra cuatro campos */}
            <div className="flex flex-col gap-2.5">
              <BotonSocial
                onClick={() => void signInWithSocial("google")}
                disabled={loading}
                icon={<GoogleIcon />}
              >
                Continuar con Google
              </BotonSocial>
              {APPLE_WEB_ENABLED ? (
                <BotonSocial
                  onClick={() => void signInWithSocial("apple")}
                  disabled={loading}
                  icon={<AppleIcon />}
                >
                  Continuar con Apple
                </BotonSocial>
              ) : null}
            </div>

            <Separador />

            <form onSubmit={submitSignIn} className="space-y-4">
              <Campo
                id="correo"
                label="Correo electrónico"
                value={email}
                onChange={setEmail}
                placeholder="tu@correo.com"
                type="email"
                autoComplete="email"
              />

              <div>
                <div className="mb-[7px] flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="password"
                    className="text-[13.5px] font-medium text-[#30302e]"
                  >
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setView("forgot");
                      setError(null);
                      setSuccess(null);
                    }}
                    className="rounded text-[12.5px] font-medium text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    ¿La olvidaste?
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
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

              {error ? <Alerta tono="error">{error}</Alerta> : null}

              <BotonPrimario loading={loading}>Iniciar sesión</BotonPrimario>
            </form>

            <p className="mt-3.5 text-center text-[11.5px] leading-[1.45] text-placeholder">
              Al continuar aceptas los{" "}
              <Link
                href="/legal/terminos"
                className="underline underline-offset-2 transition-colors hover:text-body"
              >
                Términos
              </Link>{" "}
              y la{" "}
              <Link
                href="/legal/privacidad"
                className="underline underline-offset-2 transition-colors hover:text-body"
              >
                Política de Privacidad
              </Link>{" "}
              de Vekino.
            </p>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-subtle">
        ¿No tienes cuenta? La crea la administración de tu conjunto.{" "}
        <Link
          href="/#contacto"
          className="font-semibold text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700"
        >
          Solicitar una demostración
        </Link>
      </p>
    </div>
  );
}

/* ── Piezas ────────────────────────────────────────────────────────────── */

/** Estilo compartido de inputs. Mismo control que los formularios de la landing. */
const CONTROL = cn(
  "w-full rounded-btn border border-[#deded9] bg-surface px-4 text-[14.5px] text-heading",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-placeholder",
  "focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/12",
);

/** Línea punteada con un círculo al centro, como el resto de separadores. */
function Separador() {
  return (
    <div aria-hidden className="relative my-5 flex items-center justify-center">
      <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-dash" />
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[10px] font-semibold text-placeholder">
        o
      </span>
    </div>
  );
}

function BotonPrimario({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
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
      {loading ? "Un momento…" : children}
    </button>
  );
}

function BotonSocial({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-btn",
        "border border-line-strong bg-surface text-[14.5px] font-semibold text-heading",
        "shadow-[0_1px_2px_rgb(20_20_20/0.04)]",
        "transition-[transform,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-card active:translate-y-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "disabled:pointer-events-none disabled:opacity-60",
        "motion-reduce:transform-none motion-reduce:transition-none",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Mensaje de estado. `role="alert"` solo en el error: el éxito ya llega tras
 * una acción explícita de la persona y no necesita interrumpir al lector.
 */
function Alerta({
  tono,
  children,
}: {
  tono: "error" | "ok";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tono === "error" ? "alert" : undefined}
      className={cn(
        "rounded-btn border px-3.5 py-2.5 text-[13px] leading-snug",
        tono === "error"
          ? "border-[#f2d4d4] bg-bad-soft text-[#a83f3f]"
          : "border-[#cdeedc] bg-ok-soft text-[#1b8b4d]",
      )}
    >
      {children}
    </p>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  type,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-[7px] block text-[13.5px] font-medium text-[#30302e]"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className={cn(CONTROL, "h-[46px]")}
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.75H1.71v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.17a6.9 6.9 0 0 1 0-4.34V6.85H1.71a11.5 11.5 0 0 0 0 10.3l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.02c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.58 15.11.5 12 .5 7.51.5 3.63 3.08 1.71 6.85l3.84 2.98C6.46 7.1 9 5.02 12 5.02Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.98.9-3.77 2.28-1.61 2.79-.41 6.92 1.15 9.19.77 1.11 1.68 2.35 2.87 2.31 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.13 2.78-2.24.87-1.28 1.23-2.52 1.25-2.59-.03-.01-2.4-.92-2.42-3.65ZM14.1 5.96c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.77-.95 2.81 1.02.08 2.05-.52 2.68-1.28Z" />
    </svg>
  );
}
