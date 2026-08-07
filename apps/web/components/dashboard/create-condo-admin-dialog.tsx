"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { mensajeErrorUsuario } from "@/lib/utils";

/**
 * Crea un administrador operativo del condominio (rol `administrador`).
 * Disponible para staff de plataforma (superadmin/admin).
 */
export function CreateCondoAdminDialog({
  condominioId,
  condominioName,
  onClose,
}: {
  condominioId: Id<"condominios">;
  condominioName: string;
  onClose: () => void;
}) {
  const createMember = useAction(api.users.createCondoMember);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Nombre y correo son obligatorios.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await createMember({
        condominioId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim() || undefined,
        password,
        roles: ["administrador"],
      });
      onClose();
    } catch (err) {
      setError(
        mensajeErrorUsuario(
          err,
          "No se pudo crear el administrador. Intenta de nuevo.",
        ),
      );
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="create-admin-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-floating"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2
            id="create-admin-title"
            className="text-lg font-semibold text-foreground"
          >
            Nuevo administrador
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Crea el admin de{" "}
          <span className="font-medium text-foreground">{condominioName}</span>.
          Podrá gestionar residentes, finanzas y operación del conjunto.
        </p>

        <form onSubmit={submit} className="space-y-3.5">
          <Field
            label="Nombre completo"
            value={name}
            onChange={setName}
            required
            autoComplete="name"
          />
          <Field
            label="Correo"
            value={email}
            onChange={setEmail}
            type="email"
            required
            autoComplete="email"
          />
          <Field
            label="Teléfono"
            value={telefono}
            onChange={setTelefono}
            placeholder="Opcional"
          />
          <Field
            label="Contraseña"
            value={password}
            onChange={setPassword}
            type="password"
            required
            autoComplete="new-password"
          />
          <Field
            label="Confirmar contraseña"
            value={password2}
            onChange={setPassword2}
            type="password"
            required
            autoComplete="new-password"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              className="flex-1"
              disabled={busy}
            >
              {busy ? "Creando…" : "Crear administrador"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-brand/30"
      />
    </div>
  );
}
