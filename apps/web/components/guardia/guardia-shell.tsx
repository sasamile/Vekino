"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ShieldCheck, BookOpenCheck, UserCheck, Package, CalendarCheck,
  AlertTriangle, Megaphone, LogOut, LayoutGrid, X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";
import { hexToHslChannels, cn, initials } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const NAV: { label: string; segment: string; icon: LucideIcon }[] = [
  { label: "Minuta", segment: "", icon: BookOpenCheck },
  { label: "Visitantes", segment: "visitantes", icon: UserCheck },
  { label: "Paquetería", segment: "paqueteria", icon: Package },
  { label: "Reservas", segment: "reservas", icon: CalendarCheck },
  { label: "Novedades", segment: "novedades", icon: AlertTriangle },
  { label: "Avisos", segment: "avisos", icon: Megaphone },
];

/** Ítems visibles en la barra inferior móvil; el resto va en "Más". */
const NAV_MOBILE = NAV.slice(0, 4);
const NAV_EXTRA = NAV.slice(4);

export function GuardiaShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AuthLoading>
        <Fullscreen><Spinner className="h-5 w-5" /></Fullscreen>
      </AuthLoading>
      <Unauthenticated>
        <Redirect to="/" />
      </Unauthenticated>
      <Authenticated>
        <Guard>{children}</Guard>
      </Authenticated>
    </div>
  );
}

function Fullscreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return <Fullscreen><Spinner className="h-5 w-5" /></Fullscreen>;
}

function Guard({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const home = useQuery(api.guardia.home, { condominioId });

  if (home === undefined) return <Fullscreen><Spinner className="h-5 w-5" /></Fullscreen>;
  if (!home.allowed) return <Redirect to="/dashboard" />;

  const base = `/guardia/${condominioId}`;
  const brandChannels = home.condominio.primaryColor
    ? hexToHslChannels(home.condominio.primaryColor)
    : null;
  const themeStyle = brandChannels
    ? ({ "--brand": brandChannels, "--ring": brandChannels } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-background" style={themeStyle}>
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar
          base={base}
          condominioId={condominioId}
          name={home.condominio.name}
          logo={home.condominio.logo}
          userName={home.userName}
          userImage={home.userImage}
        />
      </aside>

      {/* Header móvil */}
      <MobileHeader
        condominioId={condominioId}
        name={home.condominio.name}
        logo={home.condominio.logo}
      />

      <main className="min-w-0 pb-24 lg:pb-10 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>

      <MobileBottomNav base={base} userName={home.userName} userImage={home.userImage} />
    </div>
  );
}

/* ───────── Indicador de turno (vivo) ───────── */
function TurnoChip({ condominioId, dark }: { condominioId: Id<"condominios">; dark?: boolean }) {
  const turno = useQuery(api.guardia.turnoActivo, { condominioId });
  if (turno === undefined) return null;
  const abierto = turno !== null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        abierto
          ? "bg-emerald-500/15 text-emerald-400"
          : dark
            ? "bg-white/10 text-slate-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", abierto ? "animate-pulse bg-emerald-400" : "bg-slate-400")} />
      {abierto ? "Turno abierto" : "Sin turno"}
    </span>
  );
}

/* ───────── Sidebar escritorio (oscuro, elegante) ───────── */
function Sidebar({
  base, condominioId, name, logo, userName, userImage,
}: {
  base: string;
  condominioId: Id<"condominios">;
  name: string;
  logo: string | null;
  userName: string;
  userImage?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      {/* Marca */}
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/20" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-xs font-bold text-brand-foreground">
              {initials(name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-slate-400">
              <ShieldCheck className="h-3 w-3" /> Seguridad
            </p>
          </div>
        </div>
        <div className="mt-3">
          <TurnoChip condominioId={condominioId} dark />
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Operación
        </p>
        {NAV.map((item) => {
          const href = item.segment ? `${base}/${item.segment}` : base;
          const active = item.segment
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === base;
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-white/10 font-medium text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />}
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "text-slate-500 group-hover:text-slate-300")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Usuario */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt={userName} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {initials(userName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="text-[11px] text-slate-500">Guardia en servicio</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Cerrar sesión"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Móvil: header + bottom nav ───────── */
function MobileHeader({
  condominioId, name, logo,
}: { condominioId: Id<"condominios">; name: string; logo: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950 lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={name} className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/20" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-[10px] font-bold text-brand-foreground">
            {initials(name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-400">
            <ShieldCheck className="h-3 w-3" /> Seguridad
          </p>
        </div>
        <TurnoChip condominioId={condominioId} dark />
      </div>
    </header>
  );
}

function MobileBottomNav({
  base,
  userName,
  userImage,
}: {
  base: string;
  userName: string;
  userImage?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function isActive(segment: string) {
    const href = segment ? `${base}/${segment}` : base;
    return segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950 lg:hidden">
        <div className="flex h-16 items-center justify-around gap-1 px-1">
          {NAV_MOBILE.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = isActive(item.segment);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "flex h-13 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
                  active ? "bg-white/10 text-white" : "text-slate-500",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-brand")} />
                <span className="w-full truncate text-center text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "flex h-13 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg",
              NAV_EXTRA.some((i) => isActive(i.segment)) ? "bg-white/10 text-white" : "text-slate-500",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Más</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-slate-950 p-4 pb-8 text-slate-200">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {userImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userImage} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : null}
                <p className="truncate text-sm font-semibold text-white">{userName} · Portería</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_EXTRA.map((item) => {
                const href = `${base}/${item.segment}`;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl border border-white/10 p-3 text-sm font-medium hover:bg-white/5"
                  >
                    <Icon className="h-5 w-5 text-brand" /> {item.label}
                  </Link>
                );
              })}
            </div>
            <button
              onClick={signOut}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-red-400 hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
