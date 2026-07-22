"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Mail, Phone, Check, Camera, Loader2, Lock, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/utils";
import { VINCULO_LABEL } from "@/components/portal/portal-ui";
import { authClient } from "@/lib/auth-client";
import { uploadToS3 } from "@/lib/upload-s3";

const ROL_LABEL: Record<string, string> = {
  propietario: "Propietario",
  apoderado: "Apoderado",
  arrendatario: "Arrendatario",
  residente: "Residente",
  administrador: "Administrador",
  junta_directiva: "Junta directiva",
  contadora: "Contadora",
  guardia: "Guardia",
  representante_asamblea: "Representante de asamblea",
};

export default function Perfil() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;

  const me = useQuery(api.users.me);
  const home = useQuery(api.portal.home, { condominioId });
  const update = useMutation(api.users.updateMyProfile);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setFirstName(me.firstName ?? "");
      setLastName(me.lastName ?? "");
      setTelefono(me.telefono ?? "");
    }
  }, [me]);

  if (me === undefined || home === undefined) {
    return (
      <PageContainer>
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      </PageContainer>
    );
  }
  if (me === null) return null;

  const roles = home?.allowed ? home.myRoles : [];

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

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Mi perfil" description="Tus datos personales y de contacto." />

      {/* Resumen + avatar */}
      <Card className="flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:text-left">
        <AvatarEditor image={me.image ?? null} name={me.name} />
        <div className="min-w-0">
          <p className="text-xl font-semibold text-foreground">{me.name}</p>
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
            <Mail className="h-4 w-4" /> {me.email}
          </p>
          {roles.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {roles.map((r) => (
                <Badge key={r} tone="brand">
                  {ROL_LABEL[r] ?? VINCULO_LABEL[r] ?? r}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Editar datos */}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Datos de contacto</h2>
        <form onSubmit={guardar} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nombres</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Apellidos</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Tus apellidos" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Teléfono</label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 300 123 4567" inputMode="tel" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button variant="brand" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 text-brand-foreground" /> : "Guardar cambios"}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Guardado
              </span>
            )}
          </div>
        </form>
      </Card>

      {/* Cambiar contraseña */}
      <CambiarPassword />

      <Card className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <p>¿Necesitas cambiar tu correo? Comunícate con la administración de tu conjunto.</p>
      </Card>
    </PageContainer>
  );
}

function AvatarEditor({ image, name }: { image: string | null; name: string }) {
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const setAvatar = useMutation(api.users.setMyAvatar);
  const clearAvatar = useMutation(api.users.clearMyAvatar);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const shown = preview ?? (image && !broken ? image : null);

  useEffect(() => {
    setBroken(false);
    setPreview(null);
  }, [image]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen debe pesar menos de 5 MB.");
      return;
    }
    setBusy(true);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBroken(false);
    try {
      const { url, key } = await uploadToS3(generateUploadUrl, file, "avatars");
      await setAvatar({ url, s3Key: key });
    } catch (err) {
      setPreview(null);
      const msg =
        err instanceof Error ? err.message : "No se pudo actualizar la foto.";
      alert(msg);
    } finally {
      URL.revokeObjectURL(localUrl);
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand/10 text-2xl font-semibold text-brand"
        aria-label="Cambiar foto de perfil"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={name}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          initials(name)
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <Camera className="h-5 w-5 text-white" />
          )}
        </span>
      </button>
      {shown && !busy && (
        <button
          type="button"
          onClick={() => void clearAvatar()}
          aria-label="Quitar foto"
          className="absolute -right-1 -top-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
      />
    </div>
  );
}

function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirmar) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword: actual,
        newPassword: nueva,
        revokeOtherSessions: false,
      });
      if (err) throw new Error(err.message ?? "No se pudo cambiar la contraseña.");
      setOk(true);
      setActual("");
      setNueva("");
      setConfirmar("");
      setTimeout(() => setOk(false), 3000);
    } catch (e2) {
      setError(
        e2 instanceof Error
          ? (e2.message.toLowerCase().includes("invalid") ? "La contraseña actual es incorrecta." : e2.message)
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
        <Lock className="h-4 w-4 text-brand" />
        Cambiar contraseña
      </h2>
      <form onSubmit={cambiar} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Contraseña actual</label>
          <Input type="password" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Nueva contraseña</label>
            <Input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Confirmar</label>
            <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="Repite la contraseña" autoComplete="new-password" />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button variant="brand" type="submit" disabled={busy || !actual || !nueva}>
            {busy ? <Spinner className="h-4 w-4 text-brand-foreground" /> : "Actualizar contraseña"}
          </Button>
          {ok && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Contraseña actualizada
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
