"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Headphones } from "lucide-react";
import { BorderBeam } from "border-beam";
import { portalNavGroupsForRoles } from "./portal-nav-config";
import { AccountMenu } from "@/components/layout/account-menu";
import { initials, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VINCULO_LABEL } from "@/components/portal/portal-ui";
import { useTheme } from "@/lib/theme";

export function PortalSidebarContent({
  base,
  name,
  logo,
  city,
  userName,
  userImage,
  isPlatform,
  roles = [],
  onNavigate,
}: {
  base: string;
  name: string;
  logo: string | null;
  coverImage?: string | null;
  city?: string | null;
  userName: string;
  userImage?: string | null;
  isPlatform: boolean;
  roles?: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { resolved } = useTheme();
  const groups = portalNavGroupsForRoles(roles);
  const condominioId = base.replace(/^\/mi\//, "") as Id<"condominios">;
  const badges = useQuery(api.portal.navBadges, { condominioId });

  const rolLabel =
    roles.map((r) => VINCULO_LABEL[r] ?? null).find(Boolean) ||
    (roles.includes("propietario")
      ? "Propietario"
      : roles[0]
        ? roles[0].replace(/_/g, " ")
        : "Residente");

  function badgeText(key?: string) {
    if (!key || !badges) return null;
    const n =
      key === "facturasVencidas"
        ? badges.facturasVencidas
        : key === "avisos"
          ? badges.avisos
          : key === "asambleas"
            ? badges.asambleas
            : key === "pqrs"
              ? badges.pqrs
              : 0;
    if (!n) return null;
    return n > 9 ? "9+" : String(n);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/80 px-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={name}
            className="h-9 w-9 shrink-0 rounded-[10px] object-cover ring-1 ring-border/80"
          />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-[11px] font-semibold text-brand">
            {initials(name).slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
            {name}
          </p>
          <p className="-mt-px truncate text-[11px] text-muted-foreground">
            {city || "Mi condominio"}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <nav className="scrollbar-none min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1">
          <div className="flex flex-col gap-3">
            {groups.map((group, gi) => (
              <div key={group.title ?? `g-${gi}`} className="flex flex-col gap-0.5">
                {group.title ? (
                  <p className="mb-0.5 px-2.5 text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground/70">
                    {group.title}
                  </p>
                ) : null}
                {group.items.map((item) => {
                  const href = item.segment ? `${base}/${item.segment}` : base;
                  const active = item.segment
                    ? pathname === href || pathname.startsWith(`${href}/`)
                    : pathname === base;
                  const Icon = item.icon;
                  const badge =
                    item.badgeKey === "facturasVencidas"
                      ? null
                      : badgeText(item.badgeKey);
                  return (
                    <Link
                      key={item.label}
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={item.hint}
                      className={cn(
                        "group flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] tracking-[-0.01em] transition-colors",
                        active
                          ? "bg-accent font-semibold text-foreground shadow-[inset_3px_0_0_0_hsl(var(--brand))]"
                          : "font-normal text-foreground/70 hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 stroke-2",
                          active
                            ? "text-brand"
                            : "text-foreground/50 group-hover:text-foreground/70",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                        {item.hint ? (
                          <span className="sr-only"> — {item.hint}</span>
                        ) : null}
                      </span>
                      {badge ? (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/70">
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-auto flex shrink-0 flex-col gap-2.5 pt-1">
          <div className="relative rounded-lg border border-border bg-muted/80 px-2.5 py-2 shadow-soft backdrop-blur-xl dark:border-white/12 dark:bg-[#1a1c1a]/75">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Headphones
                className="h-3 w-3 shrink-0 stroke-[1.5] text-foreground"
                aria-hidden
              />
              <p className="text-[12px] font-medium text-foreground">
                ¿Necesitas ayuda?
              </p>
            </div>
            <BorderBeam
              size="sm"
              colorVariant="ocean"
              theme={resolved}
              strength={0.85}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full rounded-full border-border bg-card text-[11.5px] font-medium shadow-soft dark:border-white/15 dark:bg-card/60"
                asChild
              >
                <Link href={`${base}/soporte`} onClick={onNavigate}>
                  Contactar soporte
                </Link>
              </Button>
            </BorderBeam>
          </div>

          <AccountMenu
            condominioId={condominioId}
            userName={userName}
            userImage={userImage}
            roleLabel={rolLabel}
            isPlatform={isPlatform}
            onNavigate={onNavigate}
            perfilHref={`${base}/perfil`}
          />
        </div>
      </div>
    </div>
  );
}
