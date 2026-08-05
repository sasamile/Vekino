import {
  House,
  UsersRound,
  DoorOpen,
  CarFront,
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  Megaphone,
  Inbox,
  LifeBuoy,
  FolderOpen,
  ChartColumn,
  Landmark,
  Users,
  Clock3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
  ready: boolean;
  /** Sinónimos / palabras para el acceso rápido */
  keywords?: string[];
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      {
        label: "Panel",
        segment: "",
        icon: House,
        ready: true,
        keywords: ["inicio", "home", "dashboard", "resumen", "admin"],
      },
    ],
  },
  {
    title: "Comunidad",
    items: [
      {
        label: "Residentes",
        segment: "residentes",
        icon: UsersRound,
        ready: true,
        keywords: ["usuarios", "miembros", "personas", "propietarios", "inquilinos"],
      },
      {
        label: "Unidades",
        segment: "unidades",
        icon: DoorOpen,
        ready: true,
        keywords: ["aptos", "apartamentos", "inmuebles", "torres", "casas"],
      },
      {
        label: "Vehículos",
        segment: "vehiculos",
        icon: CarFront,
        ready: true,
        keywords: ["carros", "motos", "placas", "parqueo", "bicicletas"],
      },
    ],
  },
  {
    title: "Operación",
    items: [
      {
        label: "Reservas",
        segment: "reservas",
        icon: CalendarDays,
        ready: true,
        keywords: ["zonas", "salon", "bbq", "piscina", "cancha", "agenda"],
      },
      {
        label: "Finanzas",
        segment: "finanzas",
        icon: CircleDollarSign,
        ready: true,
        keywords: ["facturas", "cartera", "pagos", "cobros", "cuotas", "mora", "recaudo"],
      },
      {
        label: "Comprobantes",
        segment: "comprobantes",
        icon: ReceiptText,
        ready: true,
        keywords: ["soportes", "pagos", "whatsapp", "transferencias", "consignaciones", "recibos"],
      },
    ],
  },
  {
    title: "Gestión",
    items: [
      {
        label: "Comunicación",
        segment: "comunicacion",
        icon: Megaphone,
        ready: true,
        keywords: ["avisos", "comunicados", "anuncios", "noticias"],
      },
      {
        label: "PQRS",
        segment: "pqrs",
        icon: Inbox,
        ready: true,
        keywords: ["peticiones", "quejas", "reclamos", "sugerencias", "tickets"],
      },
      {
        label: "Soporte",
        segment: "soporte",
        icon: LifeBuoy,
        ready: true,
        keywords: ["ayuda", "tickets", "vekino"],
      },
      {
        label: "Documentos",
        segment: "documentos",
        icon: FolderOpen,
        ready: true,
        keywords: ["docs", "archivos", "pdf", "actas", "reglamento", "repositorio"],
      },
      {
        label: "Reportes",
        segment: "reportes",
        icon: ChartColumn,
        ready: true,
        keywords: ["estadisticas", "exportar", "graficas", "analisis"],
      },
    ],
  },
  {
    title: "Gobernanza",
    items: [
      {
        label: "Asamblea",
        segment: "asamblea",
        icon: Landmark,
        ready: true,
        keywords: ["votaciones", "quorum", "poderes", "convocatoria"],
      },
      {
        label: "Consejo",
        segment: "consejo",
        icon: Users,
        ready: true,
        keywords: ["junta", "directiva", "consejeros", "documentos", "actas", "comentarios"],
      },
      {
        label: "Historial",
        segment: "historial",
        icon: Clock3,
        ready: true,
        keywords: ["auditoria", "actividad", "log", "eventos"],
      },
    ],
  },
];

const ROLE_SEGMENTS: Record<string, string[]> = {
  // Misma lógica que VekinoWeb CONTADORA: finanzas + reportes + docs + consejo.
  contadora: ["", "finanzas", "comprobantes", "reportes", "documentos", "consejo"],
  // junta_directiva vive en el portal (/mi) con sección Consejo; no abre shell admin.
  representante_asamblea: ["", "asamblea", "consejo", "documentos", "historial"],
};

/** Segmentos siempre permitidos en el shell (cuenta). */
const ALWAYS_ALLOWED = new Set(["perfil"]);

/**
 * `null` = acceso total (admin / plataforma).
 * `Set` = lista blanca de segmentos (primer path tras /condominio/:id).
 */
export function allowedCondoSegments(
  roles: string[],
  isPlatform: boolean,
): Set<string> | null {
  if (isPlatform || roles.includes("administrador")) return null;

  const allowed = new Set<string>(ALWAYS_ALLOWED);
  for (const r of roles) {
    for (const seg of ROLE_SEGMENTS[r] ?? []) allowed.add(seg);
  }

  // Contadora (u otro rol restringido) sin ser admin → lista blanca.
  if (roles.includes("contadora") || roles.includes("representante_asamblea")) {
    return allowed;
  }

  return null;
}

export function canAccessCondoSegment(
  roles: string[],
  isPlatform: boolean,
  segment: string,
): boolean {
  const allowed = allowedCondoSegments(roles, isPlatform);
  if (allowed === null) return true;
  return allowed.has(segment || "");
}

export function visibleNavGroups(roles: string[], isPlatform: boolean): NavGroup[] {
  if (isPlatform || roles.includes("administrador")) return NAV_GROUPS;

  const allowed = allowedCondoSegments(roles, isPlatform) ?? new Set([""]);

  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => allowed.has(it.segment)),
    }))
    .filter((g) => g.items.length > 0);
}
