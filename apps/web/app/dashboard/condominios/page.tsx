"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { Building2, X, ChevronRight } from "lucide-react";
import { api } from "@vekino/backend/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { Card } from "@/components/ui/card";

export default function CondominiosPage() {
  const me = useQuery(api.users.me);
  const isPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";
  const condominios = useQuery(
    api.condominios.listAll,
    isPlatform ? {} : "skip",
  );
  const [showCreate, setShowCreate] = useState(false);
  useNuevoQuery(() => setShowCreate(true));

  if (me === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }

  if (!isPlatform) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">No tienes acceso a esta sección.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Condominios"
          description="Gestiona todos los conjuntos de la plataforma."
        />

        <Card className="overflow-hidden p-0">
          {condominios === undefined ? (
            <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
          ) : condominios.length === 0 ? (
            <div className="p-10 text-center">
              <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Aún no hay condominios. Crea el primero.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Ciudad</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {condominios.map((c) => (
                  <CondominioRow key={c._id} c={c} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} />}
    </PageContainer>
  );
}

function CondominioRow({
  c,
}: {
  c: NonNullable<ReturnType<typeof useQuery<typeof api.condominios.listAll>>>[number];
}) {
  const setActive = useMutation(api.condominios.setActive);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await setActive({ condominioId: c._id, isActive: !c.isActive });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-zinc-50/50">
      <td className="px-5 py-3.5 font-medium text-zinc-900">
        <Link
          href={`/dashboard/condominios/${c._id}`}
          className="inline-flex items-center gap-1 hover:text-primary hover:underline"
        >
          {c.name}
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        </Link>
      </td>
      <td className="px-5 py-3.5 text-zinc-600">{c.city ?? "—"}</td>
      <td className="px-5 py-3.5 text-zinc-600 capitalize">
        {c.subscriptionPlan ?? "—"}
      </td>
      <td className="px-5 py-3.5">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            c.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {c.isActive ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="inline-flex items-center gap-3">
          <Link
            href={`/condominio/${c._id}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Administrar
          </Link>
          <button
            onClick={toggle}
            disabled={busy}
            className="text-xs font-medium text-zinc-500 hover:underline disabled:opacity-50"
          >
            {c.isActive ? "Desactivar" : "Activar"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useMutation(api.condominios.create);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [nit, setNit] = useState("");
  const [plan, setPlan] = useState<"basico" | "pro" | "enterprise">("basico");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await create({
        name: name.trim(),
        city: city.trim() || undefined,
        nit: nit.trim() || undefined,
        subscriptionPlan: plan,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nuevo condominio
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Nombre" value={name} onChange={setName} required />
          <Input label="Ciudad" value={city} onChange={setCity} />
          <Input label="NIT" value={nit} onChange={setNit} />
          <div>
            <label className="text-sm font-medium text-zinc-700">Plan</label>
            <select
              value={plan}
              onChange={(e) =>
                setPlan(e.target.value as "basico" | "pro" | "enterprise")
              }
              className="w-full mt-1.5 py-2.5 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="basico">Básico</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "Creando…" : "Crear condominio"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full mt-1.5 py-2.5 px-3 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
      />
    </div>
  );
}
