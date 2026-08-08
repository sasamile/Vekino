import {
  House,
  Building2,
  UsersRound,
  CalendarClock,
  LifeBuoy,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

export interface PlatformNavItem {
  label: string;
  href: string;
  segment: string;
  icon: LucideIcon;
  keywords?: string[];
}

export const PLATFORM_NAV: PlatformNavItem[] = [
  {
    label: "Inicio",
    href: "/dashboard",
    segment: "",
    icon: House,
    keywords: ["panel", "home", "maestro", "resumen", "stats"],
  },
  {
    label: "Condominios",
    href: "/dashboard/condominios",
    segment: "condominios",
    icon: Building2,
    keywords: ["conjuntos", "edificios", "crear", "clientes"],
  },
  {
    label: "Administradores",
    href: "/dashboard/administradores",
    segment: "administradores",
    icon: UsersRound,
    keywords: ["staff", "superadmin", "roles", "usuarios", "equipo"],
  },
  {
    label: "Automatizaciones",
    href: "/dashboard/automatizaciones",
    segment: "automatizaciones",
    icon: CalendarClock,
    keywords: [
      "envios",
      "programar",
      "mensaje",
      "residentes",
      "apoderados",
      "asamblea",
      "correo",
      "whatsapp",
      "recordatorios",
      "agendar",
    ],
  },
  {
    label: "Bandeja",
    href: "/dashboard/inbox",
    segment: "inbox",
    icon: MessagesSquare,
    keywords: [
      "inbox",
      "whatsapp",
      "chats",
      "conversaciones",
      "mensajes",
      "bot",
      "agente",
      "residentes",
      "responder",
    ],
  },
  {
    label: "Soporte",
    href: "/dashboard/soporte",
    segment: "soporte",
    icon: LifeBuoy,
    keywords: ["tickets", "ayuda", "pqrs", "incidencias"],
  },
];
