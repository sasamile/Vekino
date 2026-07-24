export function cop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function fmtPeriodo(periodo: string): string {
  const parts = periodo.split("-");
  const y = parts[0] ?? "";
  const m = Number(parts[1] ?? 1);
  const months = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${months[m] ?? ""} ${y}`;
}

export function fmtFechaCorta(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Convierte NOMBRES EN MAYÚSCULAS a Title Case; deja el resto igual. */
export function formatDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return t;
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) {
    return t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return t;
}

/** Nombre para saludo: first+last o name, con mayúsculas normalizadas. */
export function greetingName(me: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string {
  const structured = [me.firstName, me.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const full = (me.name ?? "").trim();
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const pick =
    words(structured) >= 2
      ? structured
      : words(full) >= 2
        ? full
        : structured || full;
  return formatDisplayName(pick);
}
