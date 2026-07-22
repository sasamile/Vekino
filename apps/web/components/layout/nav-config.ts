import {
  House,
  UsersRound,
  DoorOpen,
  CarFront,
  CalendarDays,
  CircleDollarSign,
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
  contadora: ["", "finanzas", "reportes", "documentos"],
  junta_directiva: [
    "", "residentes", "unidades", "vehiculos", "reservas",
    "comunicacion", "pqrs", "soporte", "documentos", "reportes", "asamblea", "consejo", "historial",
  ],
  representante_asamblea: ["", "asamblea", "consejo", "documentos", "historial"],
};

export function visibleNavGroups(roles: string[], isPlatform: boolean): NavGroup[] {
  if (isPlatform || roles.includes("administrador")) return NAV_GROUPS;

  const allowed = new Set<string>([""]);
  for (const r of roles) {
    for (const seg of ROLE_SEGMENTS[r] ?? []) allowed.add(seg);
  }

  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => allowed.has(it.segment)) }))
    .filter((g) => g.items.length > 0);
}
