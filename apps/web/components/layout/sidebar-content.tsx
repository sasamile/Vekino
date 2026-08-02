"use client";

import Link from "next/link";
import { Headphones } from "lucide-react";
import { BorderBeam } from "border-beam";
import type { Id } from "@vekino/backend/dataModel";
import { SidebarNav } from "./sidebar-nav";
import { CondoSwitcher } from "./condo-switcher";
import { AccountMenu } from "./account-menu";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function SidebarContent({
  base,
  condominioId,
  name,
  logo,
  city,
  userName,
  userImage,
  isPlatform,
  roles,
  onNavigate,
}: {
  base: string;
  condominioId: Id<"condominios">;
  name: string;
  logo: string | null;
  city?: string | null;
  userName: string;
  userImage?: string | null;
  isPlatform: boolean;
  roles: string[];
  onNavigate?: () => void;
}) {
  const { resolved } = useTheme();

  const roleLabel = roles.includes("administrador")
    ? "Administrador"
    : roles.includes("contadora")
      ? "Contadora"
      : isPlatform
        ? "Plataforma"
        : "Miembro";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      {/* Misma altura que AdminTopbar (h-16) para alinear el borde */}
      <div className="flex h-16 shrink-0 items-center border-b border-border/80 px-3">
        <CondoSwitcher
          currentId={condominioId}
          name={name}
          logo={logo}
          city={city}
          isPlatform={isPlatform}
          onNavigate={onNavigate}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <SidebarNav
          base={base}
          roles={roles}
          isPlatform={isPlatform}
          onNavigate={onNavigate}
        />

        <div className="mt-auto flex shrink-0 flex-col gap-2.5 pt-1">
          <div className="relative rounded-xl border border-brand/20 bg-brand/[0.07] p-3 shadow-soft dark:border-brand/25 dark:bg-brand/10">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Headphones
                className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-brand"
                aria-hidden
              />
              <p className="text-[12.5px] font-medium text-foreground">
                ¿Necesitas ayuda?
              </p>
            </div>
            <p className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground">
              Habla con soporte Vekino y te ayudamos en menos de 24h hábiles.
            </p>
          <BorderBeam
            size="sm"
            colorVariant="ocean"
            theme={resolved}
            strength={0.85}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full rounded-full border-brand/25 bg-card/80 text-[12px] font-medium shadow-soft hover:bg-card dark:border-brand/30 dark:bg-card/50"
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
          roleLabel={roleLabel}
          isPlatform={isPlatform}
          onNavigate={onNavigate}
        />
      </div>
      </div>
    </div>
  );
}
