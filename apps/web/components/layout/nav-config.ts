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
