import {
  Home,
  Wallet,
  Megaphone,
  Car,
  UserCheck,
  MessageSquareWarning,
  CalendarCheck,
  FileText,
  Gavel,
  Users2,
  type LucideIcon,
} from "lucide-react";

export interface PortalNavItem {
  label: string;
  /** Texto de apoyo opcional (accesibilidad / personas mayores). */
  hint?: string;
  segment: string;
  icon: LucideIcon;
  roles?: string[];
  /** Clave de badge en portal.navBadges */
  badgeKey?: "facturasVencidas" | "avisos" | "asambleas" | "pqrs";
}

export interface PortalNavGroup {
  title?: string;
  items: PortalNavItem[];
}

/**
 * Navegación del portal — agrupada como el sidebar admin.
 * Lenguaje sencillo: muchos usuarios son personas mayores.
 */
export const PORTAL_NAV_GROUPS: PortalNavGroup[] = [
  {
    title: "Principal",
    items: [
      { label: "Inicio", segment: "", icon: Home },
      {
        label: "Mis facturas",
        segment: "cuenta",
        icon: Wallet,
        badgeKey: "facturasVencidas",
      },
    ],
  },
  {
    title: "Comunidad",
    items: [
      { label: "Avisos", segment: "avisos", icon: Megaphone, badgeKey: "avisos" },
      { label: "Visitantes", segment: "visitantes", icon: UserCheck },
      { label: "Vehículos", segment: "vehiculos", icon: Car },
      { label: "Reservas", segment: "reservas", icon: CalendarCheck },
      {
        label: "Asambleas",
        segment: "asambleas",
        icon: Gavel,
        badgeKey: "asambleas",
      },
    ],
  },
  {
    title: "Gestión",
    items: [
      {
        label: "PQRS",
        hint: "Peticiones y solicitudes",
        segment: "pqrs",
        icon: MessageSquareWarning,
        badgeKey: "pqrs",
      },
      { label: "Documentos", segment: "documentos", icon: FileText },
      {
        label: "Consejo",
        segment: "consejo",
        icon: Users2,
        roles: ["junta_directiva"],
      },
    ],
  },
];

/** Flat list (compat / bottom nav legacy). */
export const PORTAL_NAV: PortalNavItem[] = PORTAL_NAV_GROUPS.flatMap(
  (g) => g.items,
);

export function portalNavForRoles(roles: string[]): PortalNavItem[] {
  return PORTAL_NAV.filter((item) => {
    if (!item.roles?.length) return true;
    return item.roles.some((r) => roles.includes(r));
  });
}

export function portalNavGroupsForRoles(roles: string[]): PortalNavGroup[] {
  return PORTAL_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (!item.roles?.length) return true;
      return item.roles.some((r) => roles.includes(r));
    }),
  })).filter((g) => g.items.length > 0);
}
