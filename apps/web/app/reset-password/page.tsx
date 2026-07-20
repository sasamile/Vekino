"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full flex flex-col gap-8 items-center justify-center bg-linear-to-b from-white from-70% to-primary/50 p-6 lg:p-12">
      <Suspense
        fallback={
          <Card>
            <p className="text-sm text-zinc-500 text-center py-8">Cargando…</p>
          </Card>
        }
      >
        <ResetPasswordForm />
      </Suspense>
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

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const linkError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError === "INVALID_TOKEN" ? "El enlace no es válido o expiró." : null,
  );
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Enlace inválido o expirado. Solicita uno nuevo.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (authError) {
        throw new Error(authError.message ?? "No se pudo restablecer la contraseña.");
      }
      setSuccess(true);
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
          {success ? "Contraseña actualizada" : "Nueva contraseña"}
        </h2>
        <p className="text-sm text-zinc-500">
          {success
            ? "Ya puedes iniciar sesión con tu nueva contraseña"
            : "Ingresa y confirma tu nueva contraseña"}
        </p>
      </div>

      {success ? (
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Ir a iniciar sesión
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700">Nueva contraseña</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                aria-label={showPassword ? "Ocultar" : "Mostrar"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Confirmar contraseña</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                required
                className="w-full pl-10 pr-3 py-3 rounded-lg border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "…" : "Guardar contraseña"}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            <Link href="/" className="underline font-medium text-primary">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      )}
    </Card>
  );
}
