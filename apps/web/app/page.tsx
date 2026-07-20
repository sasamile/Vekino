"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col gap-8 items-center justify-center bg-linear-to-b from-white from-70% to-primary/50 p-6 lg:p-12">
      <AuthLoading>
        <Card>
          <p className="text-sm text-zinc-500 text-center py-8">Cargando…</p>
        </Card>
      </AuthLoading>
      <Unauthenticated>
        <LoginCard />
        <Branding />
      </Unauthenticated>
      <Authenticated>
        <RedirectToDashboard />
      </Authenticated>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md space-y-6 bg-white shadow-xl shadow-primary/5 ring-1 ring-zinc-100 rounded-2xl p-8">
      {children}
    </div>
  );
}

function Branding() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Image src="/logos/isotipo-vekino.svg" alt="Vekino" width={44} height={44} />
      <p className="text-xs text-black/60 font-medium">
        Powered by <span className="text-primary font-bold">Vekino</span>
      </p>
    </div>
  );
}

function RedirectToDashboard() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <Card>
      <p className="text-sm text-zinc-500 text-center py-8">Entrando…</p>
    </Card>
  );
}

function LoginCard() {
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

  return (
    <Card>
      <Image
        src="/logos/logo-vekino.svg"
        alt="Vekino"
        width={176}
        height={60}
        className="w-44 h-auto mx-auto"
        priority
      />

      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold text-zinc-900">
          {view === "signin"
            ? "Inicia sesión en tu cuenta"
            : "Recuperar contraseña"}
        </h2>
        <p className="text-sm text-zinc-500">
          {view === "signin"
            ? "Accede con tu correo y contraseña"
            : "Te enviaremos un enlace a tu correo"}
        </p>
      </div>

      {view === "signin" ? (
        <form onSubmit={submitSignIn} className="space-y-4">
          <Field
            icon={<Mail className="w-4 h-4" />}
            label="Correo electrónico"
            value={email}
            onChange={setEmail}
            placeholder="tu@correo.com"
            type="email"
          />

          <div>
            <label className="text-sm font-medium text-zinc-700">
              Contraseña
            </label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                required
                className="w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                aria-label={showPassword ? "Ocultar" : "Mostrar"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "…" : "Iniciar sesión"}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            <button
              type="button"
              onClick={() => {
                setView("forgot");
                setError(null);
                setSuccess(null);
              }}
              className="underline font-medium text-primary"
            >
              Olvidé mi contraseña
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={submitForgot} className="space-y-4">
          <Field
            icon={<Mail className="w-4 h-4" />}
            label="Correo electrónico"
            value={email}
            onChange={setEmail}
            placeholder="tu@correo.com"
            type="email"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "…" : "Enviar enlace"}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            <button
              type="button"
              onClick={() => {
                setView("signin");
                setError(null);
                setSuccess(null);
              }}
              className="underline font-medium text-primary"
            >
              Volver a iniciar sesión
            </button>
          </p>
        </form>
      )}
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
      </div>
    </div>
  );
}
