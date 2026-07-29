"use client";

import type { LucideIcon } from "lucide-react";
import {
  Folder,
  FileText,
  Landmark,
  Scale,
  Wallet,
  ClipboardList,
  Users2,
  Building2,
  Shield,
  CalendarDays,
  BarChart3,
  ScrollText,
  Gavel,
  Home,
  Wrench,
  Megaphone,
  BookOpen,
  Archive,
  Star,
  Heart,
  Flag,
  Lightbulb,
  Briefcase,
  PiggyBank,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoriaIconType = "lucide" | "emoji" | "svg" | "image";

export type CategoriaIconData = {
  iconType?: CategoriaIconType | null;
  iconValue?: string | null;
  iconKey?: string | null;
  colorKey?: string | null;
};

export const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  "file-text": FileText,
  landmark: Landmark,
  scale: Scale,
  wallet: Wallet,
  "clipboard-list": ClipboardList,
  users: Users2,
  building: Building2,
  shield: Shield,
  calendar: CalendarDays,
  chart: BarChart3,
  scroll: ScrollText,
  gavel: Gavel,
  home: Home,
  wrench: Wrench,
  megaphone: Megaphone,
  book: BookOpen,
  archive: Archive,
  star: Star,
  heart: Heart,
  flag: Flag,
  lightbulb: Lightbulb,
  briefcase: Briefcase,
  piggy: PiggyBank,
};

export const LUCIDE_ICON_OPTIONS = Object.keys(LUCIDE_ICON_MAP);

export const COLOR_KEY_STYLES: Record<string, string> = {
  slate: "bg-muted text-muted-foreground",
  amber: "bg-amber-400/90 text-amber-950",
  brand: "bg-brand text-brand-foreground",
  sky: "bg-sky-500/90 text-white",
  emerald: "bg-emerald-500/90 text-white",
  violet: "bg-violet-500/90 text-white",
  rose: "bg-rose-400/90 text-white",
  teal: "bg-teal-500/90 text-white",
};

export const EMOJI_PRESETS = [
  "📁",
  "📂",
  "🧾",
  "📊",
  "💰",
  "⚖️",
  "🏛️",
  "📋",
  "📝",
  "🏠",
  "🔧",
  "📢",
  "👥",
  "🔐",
  "📅",
  "⭐",
  "💡",
  "🗂️",
  "📌",
  "🎯",
];

/** Quita lo peligroso de un SVG pegado (scripts, handlers, etc.). */
export function sanitizeSvgMarkup(raw: string): string {
  let s = raw.trim();
  if (!s.toLowerCase().includes("<svg")) {
    throw new Error("Pega un SVG válido que empiece con <svg …>.");
  }
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/javascript:/gi, "");
  s = s.replace(/data:text\/html/gi, "");
  return s;
}

export function resolveIconType(data: CategoriaIconData): CategoriaIconType {
  if (data.iconType) return data.iconType;
  return "lucide";
}

export function resolveIconValue(data: CategoriaIconData): string {
  if (data.iconValue?.trim()) return data.iconValue.trim();
  if (data.iconKey?.trim()) return data.iconKey.trim();
  return "folder";
}

export function CategoriaIcon({
  data,
  className,
  iconClassName,
  size = "md",
}: {
  data: CategoriaIconData;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const type = resolveIconType(data);
  const value = resolveIconValue(data);
  const color =
    COLOR_KEY_STYLES[data.colorKey ?? "slate"] ?? COLOR_KEY_STYLES.slate;

  const box =
    size === "sm"
      ? "h-8 w-8 rounded-lg text-base"
      : size === "lg"
        ? "h-14 w-14 rounded-2xl text-2xl"
        : "h-11 w-11 rounded-xl text-xl";

  const lucideSize =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

  if (type === "emoji") {
    return (
      <span
        className={cn(
          "grid place-items-center bg-muted/80 leading-none",
          box,
          className,
        )}
        aria-hidden
      >
        {value}
      </span>
    );
  }

  if (type === "image") {
    return (
      <span
        className={cn("overflow-hidden bg-muted", box, className)}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  if (type === "svg") {
    return (
      <span
        className={cn(
          "grid place-items-center overflow-hidden p-2 text-foreground [&_svg]:h-full [&_svg]:w-full",
          color,
          box,
          className,
        )}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  const Lucide = LUCIDE_ICON_MAP[value] ?? Folder;
  return (
    <span
      className={cn("grid place-items-center", color, box, className)}
      aria-hidden
    >
      <Lucide className={cn(lucideSize, iconClassName)} />
    </span>
  );
}
