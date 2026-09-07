"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { ShieldCheck, ChevronRight, Building2, Users } from "lucide-react";
import { api } from "@vekino/backend/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type Estado = "activa" | "suspendida" | "inactiva";

const TONO: Record<Estado, "success" | "warning" | "neutral"> = {
  activa: "success",
  suspendida: "warning",
  inactiva: "neutral",
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  return <Badge tone={TONO[estado]}>{estado}</Badge>;
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <PageContainer>
      <p className="text-sm text-muted-foreground">Abriendo tu compañía…</p>
    </PageContainer>
  );
}

export default function CompaniasPage() {
  const me = useQuery(api.users.me);
  const isPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";
  const companias = useQuery(api.companias.listAll, isPlatform ? {} : "skip");

  const [showCreate, setShowCreate] = useState(false);
  useNuevoQuery(() => setShowCreate(true));

  if (me === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }

  /* El directorio de compañías es de la plataforma, pero quien pertenece a
   * una tiene todo el derecho a llegar A LA SUYA: antes esta pantalla le
   * respondía "no tienes acceso" y ahí se acababa el recorrido. */
  if (!isPlatform) {
    if (me?.compania) {
      return <Redirect to={`/dashboard/companias/${me.compania.companiaId}`} />;
    }
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">
          No tienes acceso a esta sección.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Compañías de vigilancia"
          description="Las empresas que prestan el servicio de seguridad. Contratarlas con un conjunto es lo que autoriza a su personal a operar la portería."
          action={
            <Button onClick={() => setShowCreate(true)}>Nueva compañía</Button>
          }
        />

        {companias === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : companias.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Todavía no hay compañías"
            description="Crea la primera para poder contratarla con un conjunto y asignarle guardas."
            action={
              <Button onClick={() => setShowCreate(true)}>Nueva compañía</Button>
            }
          />
        ) : (
          <div className="grid gap-3">
            {companias.map((c) => (
              <Link key={c._id} href={`/dashboard/companias/${c._id}`}>
                <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/40">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                    <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {c.nombre}
                      </p>
                      <EstadoBadge estado={c.estado as Estado} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.nit ? `NIT ${c.nit}` : "Sin NIT registrado"}
                      {c.contactoEmail ? ` · ${c.contactoEmail}` : ""}
                    </p>
                  </div>

                  <div className="hidden items-center gap-6 text-right sm:flex">
                    <Metric
                      icon={Users}
                      valor={c.personalCount}
                      label="personal"
                      detalle={`${c.supervisorCount} sup · ${c.guardiaCount} guardas`}
                    />
                    <Metric
                      icon={Building2}
                      valor={c.contratosVigentes}
                      label="conjuntos"
                    />
                  </div>

                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CrearCompaniaDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </PageContainer>
  );
}

function Metric({
  icon: Icon,
  valor,
  label,
  detalle,
}: {
  icon: typeof Users;
  valor: number;
  label: string;
  detalle?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-end gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {valor}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{detalle ?? label}</p>
    </div>
  );
}

function CrearCompaniaDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const registrar = useAction(api.companias.registrar);
  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [adminNombre, setAdminNombre] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cerrar() {
    setNombre("");
    setNit("");
    setEmail("");
    setTelefono("");
    setAdminNombre("");
    setAdminEmail("");
    setAdminPassword("");
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registrar({
        nombre,
        nit: nit || undefined,
        contactoEmail: email || undefined,
        contactoTelefono: telefono || undefined,
        adminName: adminNombre,
        adminEmail,
        adminPassword,
      });
      cerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Nueva compañía de vigilancia"
      description="Se crea la empresa y la cuenta de su administrador. Con esa cuenta entra a Vekino y da de alta a su propio personal."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Campo label="Nombre o razón social" requerido>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Seguridad Andina S.A.S."
            required
            autoFocus
          />
        </Campo>
        <Campo label="NIT">
          <Input
            value={nit}
            onChange={(e) => setNit(e.target.value)}
            placeholder="900123456-7"
          />
        </Campo>
        <Campo label="Correo de contacto">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operaciones@empresa.com"
          />
        </Campo>
        <Campo label="Teléfono de contacto">
          <Input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+57 300 000 0000"
          />
        </Campo>

        {/* La cuenta con la que la empresa entra. El correo de contacto de
            arriba es un dato de la ficha, no una credencial: separarlos
            visualmente evita que se confundan. */}
        <div className="space-y-3.5 rounded-lg border border-border bg-muted/30 p-3.5">
          <p className="text-[12.5px] font-medium text-foreground">
            Administrador de la compañía
          </p>
          <p className="-mt-2 text-[11.5px] text-muted-foreground">
            Entra con estas credenciales y desde ahí administra a sus
            supervisores y guardas.
          </p>
          <Campo label="Nombre completo" requerido>
            <Input
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
              placeholder="María Restrepo"
              required
            />
          </Campo>
          <Campo label="Correo" requerido>
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="maria@empresa.com"
              required
            />
          </Campo>
          <Campo
            label="Contraseña"
            requerido
            ayuda="Mínimo 8 caracteres. Es con la que entrará a la plataforma."
          >
            <Input
              type="text"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength={8}
            />
          </Campo>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              !nombre.trim() ||
              !adminNombre.trim() ||
              !adminEmail.trim() ||
              adminPassword.trim().length < 8
            }
          >
            {busy ? "Creando…" : "Crear compañía"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function Campo({
  label,
  requerido,
  ayuda,
  children,
}: {
  label: string;
  requerido?: boolean;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-foreground">
        {label}
        {requerido && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  );
}
