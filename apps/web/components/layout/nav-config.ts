import {
  LayoutDashboard,
  Users,
  Building2,
  Car,
  ShieldCheck,
  CalendarCheck,
  Wallet,
  MessageSquare,
  FileText,
  BarChart3,
  Gavel,
  MessageSquareWarning,
  Users2,
  History,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  segment: string; // ruta relativa al base del condominio ("" = inicio)
  icon: LucideIcon;
  ready: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { label: "Dashboard", segment: "", icon: LayoutDashboard, ready: true },
    ],
  },
  {
    title: "Comunidad",
    items: [
      { label: "Residentes", segment: "residentes", icon: Users, ready: true },
      { label: "Unidades", segment: "unidades", icon: Building2, ready: true },
      { label: "Vehículos", segment: "vehiculos", icon: Car, ready: true },
    ],
  },
  {
    title: "Operación",
    items: [
      { label: "Control", segment: "control", icon: ShieldCheck, ready: true },
      { label: "Reservas", segment: "reservas", icon: CalendarCheck, ready: true },
      { label: "Finanzas", segment: "finanzas", icon: Wallet, ready: true },
    ],
  },
  {
    title: "Gestión",
    items: [
      { label: "Comunicación", segment: "comunicacion", icon: MessageSquare, ready: true },
      { label: "PQRS", segment: "pqrs", icon: MessageSquareWarning, ready: true },
      { label: "Soporte", segment: "soporte", icon: LifeBuoy, ready: true },
      { label: "Documentos", segment: "documentos", icon: FileText, ready: true },
      { label: "Reportes", segment: "reportes", icon: BarChart3, ready: true },
    ],
  },
  {
    title: "Gobernanza",
    items: [
      { label: "Asamblea", segment: "asamblea", icon: Gavel, ready: true },
      { label: "Consejo", segment: "consejo", icon: Users2, ready: true },
      { label: "Historial", segment: "historial", icon: History, ready: true },
    ],
  },
];

/**
 * Segmentos visibles por rol operativo. `administrador` (y staff de plataforma)
 * ven todo. Los demás roles ven un subconjunto acorde a su función.
 * "" = Dashboard (inicio del condominio).
 */
const ROLE_SEGMENTS: Record<string, string[]> = {
  // Finanzas / cartera: solo lo económico.
  contadora: ["", "finanzas", "reportes", "documentos"],
  // Consejo / junta: gobernanza y supervisión de la comunidad (sin finanzas).
  junta_directiva: [
    "", "residentes", "unidades", "vehiculos", "control", "reservas",
    "comunicacion", "pqrs", "soporte", "documentos", "reportes", "asamblea", "consejo", "historial",
  ],
  // Vocero de asamblea: gobernanza y documentos.
  representante_asamblea: ["", "asamblea", "consejo", "documentos", "historial"],
};

/**
 * Grupos de navegación visibles para los roles dados. Administrador o staff de
 * plataforma → todo. Sin rol reconocido → solo el Dashboard (fallback seguro).
 */
export function visibleNavGroups(roles: string[], isPlatform: boolean): NavGroup[] {
  if (isPlatform || roles.includes("administrador")) return NAV_GROUPS;

  const allowed = new Set<string>([""]); // Dashboard siempre visible
  for (const r of roles) {
    for (const seg of ROLE_SEGMENTS[r] ?? []) allowed.add(seg);
  }

  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => allowed.has(it.segment)) }))
    .filter((g) => g.items.length > 0);
}
