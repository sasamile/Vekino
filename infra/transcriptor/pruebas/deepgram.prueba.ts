/**
 * Pruebas del motor contra un Deepgram falso.
 *
 * Levanta un WebSocket local que habla el mismo protocolo y comprueba lo que
 * de verdad puede salir mal: que las frases se junten hasta el `speech_final`
 * y no antes, que el audio que llega mientras el socket abre no se pierda,
 * que un corte entregue lo que había a medias, y que la confianza sea el
 * promedio de lo acumulado.
 *
 *   node --test "pruebas/*.prueba.ts"
 *
 * El servidor es UNO solo para todo el archivo: la configuración se lee al
 * importar y se queda con el puerto de ese momento, así que levantar uno por
 * prueba dejaría a las siguientes hablándole a un puerto muerto.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { WebSocketServer, type WebSocket as WS } from "ws";

process.env.CONVEX_SITE_URL ??= "http://localhost:1";
process.env.TRANSCRIPTOR_SECRET ??= "x".repeat(32);
process.env.LIVEKIT_URL ??= "ws://localhost:1";
process.env.LIVEKIT_API_KEY ??= "llave";
process.env.LIVEKIT_API_SECRET ??= "secreto";
process.env.DEEPGRAM_API_KEY ??= "falsa";

let wss: WebSocketServer;
/** Conexiones aceptadas, en orden: cada prueba consume la suya. */
const pendientes: WS[] = [];
const esperando: ((ws: WS) => void)[] = [];
const recibidoPorSocket = new WeakMap<WS, Buffer[]>();

function proximaConexion(): Promise<WS> {
  const ya = pendientes.shift();
  if (ya) return Promise.resolve(ya);
  return new Promise((r) => esperando.push(r));
}

before(async () => {
  wss = new WebSocketServer({ port: 0 });
  wss.on("connection", (ws) => {
    const recibido: Buffer[] = [];
    recibidoPorSocket.set(ws, recibido);
    ws.on("message", (d, esBinario) => {
      if (esBinario) recibido.push(Buffer.from(d as Buffer));
    });
    const espera = esperando.shift();
    if (espera) espera(ws);
    else pendientes.push(ws);
  });
  await new Promise<void>((r) => wss.on("listening", () => r()));
  const puerto = (wss.address() as AddressInfo).port;
  process.env.DEEPGRAM_URL = `ws://localhost:${puerto}`;
});

after(async () => {
  await new Promise<void>((r) => wss.close(() => r()));
});

/** El motor se importa dentro de cada prueba: ya hay puerto en el entorno. */
const motor = async () => (await import("../src/stt/deepgram.ts")).motorDeepgram;

function resultado(opciones: {
  texto: string;
  start: number;
  duration: number;
  speechFinal: boolean;
  confidence?: number;
}) {
  return JSON.stringify({
    type: "Results",
    channel: {
      alternatives: [
        { transcript: opciones.texto, confidence: opciones.confidence ?? 0.9 },
      ],
    },
    start: opciones.start,
    duration: opciones.duration,
    is_final: true,
    speech_final: opciones.speechFinal,
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("junta frases hasta speech_final y no antes", async () => {
  const frases: { texto: string; desdeMs: number; hastaMs: number }[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  ws.send(resultado({ texto: "Buenas tardes", start: 1, duration: 1, speechFinal: false }));
  await esperar(40);
  assert.equal(frases.length, 0, "no debe emitir sin speech_final");

  ws.send(resultado({ texto: "a todos", start: 2, duration: 1, speechFinal: true }));
  await esperar(60);

  assert.equal(frases.length, 1);
  assert.equal(frases[0]!.texto, "Buenas tardes a todos");
  assert.equal(frases[0]!.desdeMs, 1000);
  assert.equal(frases[0]!.hastaMs, 3000);

  await sesion.cerrar();
});

test("no pierde el audio que llega antes de que abra el socket", async () => {
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: () => {},
  });

  // Se empuja de inmediato: el socket todavía está negociando.
  sesion.empujar(Buffer.from([1, 2, 3, 4]));
  sesion.empujar(Buffer.from([5, 6, 7, 8]));

  const ws = await proximaConexion();
  await esperar(100);

  const todo = Buffer.concat(recibidoPorSocket.get(ws) ?? []);
  assert.deepEqual([...todo], [1, 2, 3, 4, 5, 6, 7, 8]);

  await sesion.cerrar();
});

test("entrega lo que quedó a medias cuando el socket se cae", async () => {
  const frases: { texto: string }[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  ws.send(resultado({ texto: "se cayó a mitad", start: 0, duration: 1, speechFinal: false }));
  await esperar(40);
  assert.equal(frases.length, 0);

  // Corte abrupto, como una caída de red.
  ws.terminate();
  await esperar(100);

  assert.equal(frases.length, 1, "media frase es mejor que ninguna");
  assert.equal(frases[0]!.texto, "se cayó a mitad");
  assert.equal(sesion.viva, false, "la sesión debe quedar muerta");
});

test("la confianza es el promedio de lo acumulado", async () => {
  const frases: { confianza?: number }[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  ws.send(resultado({ texto: "uno", start: 0, duration: 1, speechFinal: false, confidence: 1 }));
  ws.send(resultado({ texto: "dos", start: 1, duration: 1, speechFinal: true, confidence: 0.5 }));
  await esperar(80);

  assert.equal(frases.length, 1);
  assert.equal(frases[0]!.confianza, 0.75);

  await sesion.cerrar();
});

test("ignora mensajes que no son resultados y JSON roto", async () => {
  const frases: unknown[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  ws.send("{ esto no es json");
  ws.send(JSON.stringify({ type: "Metadata", request_id: "abc" }));
  ws.send(JSON.stringify({ type: "UtteranceEnd" }));
  await esperar(60);

  assert.equal(frases.length, 0);
  assert.equal(sesion.viva, true, "basura no debe tumbar la sesión");

  await sesion.cerrar();
});

test("el silencio no genera frases vacías", async () => {
  const frases: unknown[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  // Deepgram manda resultados vacíos cuando hay audio sin habla.
  ws.send(resultado({ texto: "", start: 0, duration: 2, speechFinal: true }));
  ws.send(resultado({ texto: "   ", start: 2, duration: 2, speechFinal: true }));
  await esperar(60);

  assert.equal(frases.length, 0);

  await sesion.cerrar();
});

test("corta solo si se acumula demasiado sin speech_final", async () => {
  const frases: { texto: string }[] = [];
  const sesion = (await motor()).abrir({
    muestreo: 16000,
    idioma: "es",
    alReconocer: (f) => frases.push(f),
  });

  const ws = await proximaConexion();
  // Alguien que habla sin pausas limpias: nunca llega el speech_final.
  const trozo = "palabra".repeat(30); // 210 caracteres
  for (let i = 0; i < 8; i++) {
    ws.send(resultado({ texto: trozo, start: i, duration: 1, speechFinal: false }));
  }
  await esperar(120);

  assert.ok(frases.length >= 1, "debe cortar sin esperar el speech_final");

  await sesion.cerrar();
});
