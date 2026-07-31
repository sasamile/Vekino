"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** El botón de Apple en web requiere un Services ID + client secret de Apple.
 *  Mientras no esté configurado se oculta para no mostrar un botón que falla. */
const APPLE_WEB_ENABLED = process.env.NEXT_PUBLIC_APPLE_WEB_LOGIN === "1";

export default function Home() {
  return (
    <div className="force-light relative min-h-screen w-full overflow-hidden bg-[#f7f5f3] p-0 sm:p-6 lg:p-10">
      {/* PatternCraft-style: grid muy suave */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(4, 32, 70, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(4, 32, 70, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, #000 35%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl overflow-hidden bg-card text-card-foreground shadow-floating sm:min-h-[calc(100vh-3rem)] sm:rounded-[28px] sm:ring-1 sm:ring-border lg:min-h-[calc(100vh-5rem)]">
        <Showcase />
        <div className="flex w-full flex-col justify-center bg-card px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16">
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
    </div>
  );
}

/** Panel izquierdo: preview + velo cálido suave (sin naranja sólido). */
function Showcase() {
  return (
    <div className="relative hidden w-1/2 overflow-hidden bg-[#e8eef5] lg:block">
      <Image
        src="/login/dashboard-preview.png"
        alt=""
        fill
        priority
        sizes="50vw"
        className="object-cover object-[center_35%]"
        aria-hidden
      />

      {/* Toque cálido ligero + oscurecido abajo para el copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-[#f6560b]/08 to-[#042046]/55"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-linear-to-t from-[#042046]/80 via-[#042046]/35 to-transparent"
      />

      <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
        <Image
          src="/logos/isotipo-vekino.svg"
          alt="Vekino"
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 drop-shadow-md"
          priority
        />

        <div className="shrink-0 space-y-3 pb-1">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            La administración de tu
            <br />
            conjunto, en un solo lugar.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-white/85 xl:text-base">
            Cuentas de cobro, reservas, visitantes, asambleas y comunicación con
            tus residentes.
          </p>
        </div>
      </div>
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

  return (
    <div className="mx-auto w-full max-w-md">
      <Image
        src="/logos/isotipo-vekino.svg"
        alt="Vekino"
        width={48}
        height={48}
        className="mb-8 h-12 w-12 lg:hidden"
        priority
      />

      {forgot ? (
        <button
          type="button"
          onClick={() => {
            setView("signin");
            setError(null);
            setSuccess(null);
          }}
          className="mb-6 -ml-1 flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}

      <h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-[2.75rem]">
        {forgot ? "Recuperar acceso" : "Iniciar sesión"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {forgot
          ? "Te enviaremos un enlace a tu correo para crear una contraseña nueva."
          : "Accede a tu conjunto residencial."}
      </p>

      {forgot ? (
        <form onSubmit={submitForgot} className="mt-8 space-y-5">
          <Field
            label="Correo electrónico"
            value={email}
            onChange={setEmail}
            placeholder="tu@correo.com"
            type="email"
            autoComplete="email"
          />

          {error ? <Alert tone="error">{error}</Alert> : null}
          {success ? <Alert tone="success">{success}</Alert> : null}

          <SubmitButton loading={loading}>Enviar enlace</SubmitButton>
        </form>
      ) : (
        <>
          <form onSubmit={submitSignIn} className="mt-8 space-y-5">
            <Field
              label="Correo electrónico"
              value={email}
              onChange={setEmail}
              placeholder="tu@correo.com"
              type="email"
              autoComplete="email"
            />

            <div>
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Contraseña
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  required
                  className="h-14 w-full rounded-full border border-border bg-muted/50 pl-5 pr-12 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <SubmitButton loading={loading}>Iniciar sesión</SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => {
              setView("forgot");
              setError(null);
              setSuccess(null);
            }}
            className="mt-4 block w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            ¿Olvidaste tu contraseña?
          </button>

          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o continúa con</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <SocialButton
              onClick={() => void signInWithSocial("google")}
              disabled={loading}
              icon={<GoogleIcon />}
              label="Google"
            />
            {APPLE_WEB_ENABLED ? (
              <SocialButton
                onClick={() => void signInWithSocial("apple")}
                disabled={loading}
                icon={<AppleIcon />}
                label="Apple"
              />
            ) : null}
          </div>

          <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
            ¿No tienes cuenta? La crea la administración de tu conjunto.
          </p>
        </>
      )}
    </div>
  );
}

function SubmitButton({
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
      className="h-14 w-full rounded-full bg-flame text-sm font-semibold text-white shadow-[0_4px_12px_rgba(246,86,11,0.22)] transition-colors hover:bg-[#e04d06] disabled:opacity-60"
    >
      {loading ? "…" : children}
    </button>
  );
}

function SocialButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full appearance-none items-center justify-center gap-3 rounded-full bg-white text-sm font-medium text-neutral-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] outline-none transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-neutral-50 disabled:opacity-60 sm:flex-1"
    >
      {icon}
      Continuar con {label}
    </button>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === "error"
          ? "text-sm text-destructive"
          : "text-sm text-success"
      }
    >
      {children}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: string;
  autoComplete?: string;
}) {
  const id = `field-${type}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
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
        className="mt-2 h-14 w-full rounded-full border border-border bg-muted/50 px-5 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
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
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.98.9-3.77 2.28-1.61 2.79-.41 6.92 1.15 9.19.77 1.11 1.68 2.35 2.87 2.31 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.13 2.78-2.24.87-1.28 1.23-2.52 1.25-2.59-.03-.01-2.4-.92-2.42-3.65ZM14.1 5.96c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.77-.95 2.81 1.02.08 2.05-.52 2.68-1.28Z" />
    </svg>
  );
}
