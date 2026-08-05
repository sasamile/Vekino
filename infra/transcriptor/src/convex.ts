import { config } from "./config.ts";

/**
 * Las dos únicas cosas que el transcriptor le pide a Convex: a qué salas
 * entrar, y dónde dejar el texto.
 *
 * Ninguna llamada revienta hacia afuera. Este proceso tiene que sobrevivir a
 * un corte de red en mitad de una asamblea de cuatro horas: si Convex no
 * responde, se pierde una frase, no la reunión.
 */

export type SalaActiva = { asambleaId: string; titulo: string };

const cabeceras = {
  Authorization: `Bearer ${config.secreto}`,
  "Content-Type": "application/json",
};

export async function salasActivas(): Promise<SalaActiva[] | null> {
  try {
    const res = await fetch(`${config.convexSite}/transcriptor/salas`, {
      headers: cabeceras,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[convex] salas → HTTP ${res.status}`);
      return null;
    }
    const cuerpo = (await res.json()) as { salas?: SalaActiva[] };
    return cuerpo.salas ?? [];
  } catch (e) {
    console.error("[convex] salas:", (e as Error).message);
    return null;
  }
}

export type Segmento = {
  asambleaId: string;
  /** Identidad del participante en el servidor de medios. */
  identidad: string;
  texto: string;
  inicioEn: number;
  finEn: number;
  confianza?: number;
};

/**
 * Envía una frase. Devuelve si quedó guardada.
 *
 * Un `false` no es un error a reintentar: casi siempre significa que la
 * asamblea ya cerró o que apagaron la transcripción, y en ambos casos
 * reintentar solo haría ruido.
 */
export async function enviarSegmento(seg: Segmento): Promise<boolean> {
  try {
    const res = await fetch(`${config.convexSite}/transcriptor/intervencion`, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify(seg),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[convex] intervención → HTTP ${res.status}`);
      return false;
    }
    const cuerpo = (await res.json()) as { guardado?: boolean };
    return cuerpo.guardado === true;
  } catch (e) {
    console.error("[convex] intervención:", (e as Error).message);
    return false;
  }
}
