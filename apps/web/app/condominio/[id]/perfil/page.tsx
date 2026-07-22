"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Lock, Mail, Phone } from "lucide-react";
import { api } from "@vekino/backend/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export default function AdminPerfilPage() {
  const me = useQuery(api.users.me);
  const update = useMutation(api.users.updateMyProfile);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    if (me) {
      setFirstName(me.firstName ?? "");
      setLastName(me.lastName ?? "");
      setTelefono(me.telefono ?? "");
    }
  }, [me]);

  if (me === undefined) {
    return (
      <PageContainer>
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      </PageContainer>
    );
  }
  if (me === null) return null;

  const displayName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") ||
    me.name ||
    me.email ||
    "Usuario";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await update({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!me?.email) return;
    setPwdLoading(true);
    setPwdMsg(null);
    try {
      await authClient.requestPasswordReset({
        email: me.email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setPwdMsg(
        "Si el correo está registrado, recibirás un enlace para restablecer la contraseña.",
      );
    } catch (err) {
      setPwdMsg(err instanceof Error ? err.message : "No se pudo enviar el correo.");
    } finally {
      setPwdLoading(false);
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader title="Mi perfil" description="Datos de tu cuenta en Vekino." />

        <div className="mx-auto grid max-w-2xl gap-4">
          <Card className="flex items-center gap-4 p-5">
            {me.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.image}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-medium text-muted-foreground">
                {initials(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-foreground">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">{me.email}</p>
            </div>
          </Card>

          <Card className="p-5">
            <form onSubmit={guardar} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nombre</span>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Apellido</span>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> Correo
                </span>
                <Input value={me.email ?? ""} disabled />
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> Teléfono
                </span>
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="300 000 0000"
                />
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {saved && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <Check className="h-4 w-4" /> Guardado
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" variant="brand" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pwdLoading}
                  onClick={resetPassword}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {pwdLoading ? "Enviando…" : "Cambiar contraseña"}
                </Button>
              </div>
              {pwdMsg && <p className="text-sm text-muted-foreground">{pwdMsg}</p>}
            </form>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
