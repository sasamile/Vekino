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
  User,
  type LucideIcon,
} from "lucide-react";

export interface PortalNavItem {
  label: string;
  segment: string; // ruta relativa al base del portal ("" = inicio)
  icon: LucideIcon;
}

/**
 * Navegación del portal del residente/propietario. Pocas opciones, lenguaje
 * sencillo e iconos grandes: muchos usuarios son personas mayores.
 */
export const PORTAL_NAV: PortalNavItem[] = [
  { label: "Inicio", segment: "", icon: Home },
  { label: "Mis facturas", segment: "cuenta", icon: Wallet },
  { label: "Avisos", segment: "avisos", icon: Megaphone },
  { label: "Visitantes", segment: "visitantes", icon: UserCheck },
  { label: "Vehículos", segment: "vehiculos", icon: Car },
  { label: "PQRS", segment: "pqrs", icon: MessageSquareWarning },
  { label: "Reservas", segment: "reservas", icon: CalendarCheck },
  { label: "Documentos", segment: "documentos", icon: FileText },
  { label: "Asambleas", segment: "asambleas", icon: Gavel },
  { label: "Mi perfil", segment: "perfil", icon: User },
];
