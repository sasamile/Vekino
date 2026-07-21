import type { Doc } from "../_generated/dataModel";

type NameFields = Pick<Doc<"users">, "name" | "firstName" | "lastName">;

function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Nombre visible: preferir nombre+apellido; evita quedar solo con el apellido. */
export function displayNameFromUser(user: NameFields): string {
  const structured = [user.firstName, user.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const full = (user.name ?? "").trim();
  const pick =
    wordCount(structured) >= 2
      ? structured
      : wordCount(full) >= 2
        ? full
        : structured || full;
  return formatDisplayName(pick);
}

/** Si viene todo en MAYÚSCULAS, pasa a Title Case. */
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
