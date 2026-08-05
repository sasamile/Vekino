import { dispose } from "@livekit/rtc-node";
import { config } from "./config.ts";
import { salasActivas } from "./convex.ts";
import { SalaTranscrita } from "./sala.ts";

/**
 * Transcriptor de asambleas de Vekino.
 *
 * Pregunta cada pocos segundos a qué salas debe entrar y mantiene una
 * conexión por asamblea encendida. Preguntar en vez de esperar un aviso es
 * deliberado: así se recupera solo de un reinicio suyo, del servidor de
 * medios o de la red, sin que nadie tenga que acordarse de volver a
 * levantarlo en mitad de una asamblea.
 */

const atendidas = new Map<string, SalaTranscrita>();

async function vuelta() {
  const salas = await salasActivas();
  // `null` es "no se pudo preguntar", que no es lo mismo que "no hay salas".
  // Si Convex parpadea, no hay que abandonar una asamblea en curso.
  if (salas === null) return;

  const activas = new Set(salas.map((s) => s.asambleaId));

  for (const [id, sala] of atendidas) {
    if (activas.has(id) && sala.viva) continue;
    atendidas.delete(id);
    await sala.salir();
  }

  for (const s of salas) {
    if (atendidas.has(s.asambleaId)) continue;
    const sala = new SalaTranscrita(s.asambleaId, s.titulo);
    // Se registra ANTES de conectar: si la conexión tarda, la siguiente
    // vuelta no debe abrir una segunda sala para la misma asamblea.
    atendidas.set(s.asambleaId, sala);
    try {
      await sala.entrar();
    } catch (e) {
      console.error(`[sala ${s.titulo}] no se pudo entrar:`, (e as Error).message);
      atendidas.delete(s.asambleaId);
      await sala.salir().catch(() => {});
    }
  }
}

let corriendo = true;

async function apagar(señal: string) {
  if (!corriendo) return;
  corriendo = false;
  console.log(`\n${señal}: cerrando…`);
  // Salir ordenadamente entrega lo que el motor tenga a medias. Matar el
  // proceso a secas perdería la última frase de cada quien.
  await Promise.all([...atendidas.values()].map((s) => s.salir().catch(() => {})));
  atendidas.clear();
  await dispose();
  process.exit(0);
}

process.on("SIGINT", () => void apagar("SIGINT"));
process.on("SIGTERM", () => void apagar("SIGTERM"));

/**
 * Una excepción suelta no puede tumbar el proceso en mitad de una asamblea:
 * se registra y se sigue. Es preferible perder una frase que la reunión.
 */
process.on("unhandledRejection", (e) => {
  console.error("[promesa sin capturar]", e);
});

console.log(
  `Transcriptor listo · modelo ${config.deepgramModelo} · idioma ${config.idioma} · sondeo ${config.sondeoMs / 1000}s`,
);

while (corriendo) {
  try {
    await vuelta();
  } catch (e) {
    console.error("[vuelta]", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, config.sondeoMs));
}
