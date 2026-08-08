"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, FileText, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { estadoLegible, fmtHora, type MensajeRow } from "./tipos";

/* -------------------------------------------------------------------------- */
/* Rescate de los mensajes históricos guardados en JSON crudo                  */
/* -------------------------------------------------------------------------- */

/**
 * MENSAJES HISTÓRICOS. Los salientes viejos se guardaron con el payload
 * interactivo de WhatsApp tal cual venía —`{"type":"button","body":{"text":…}}`—
 * en vez del texto legible, y en la burbuja se veía el JSON entero. El backend
 * ya guarda legible de ahora en adelante, pero lo viejo sigue en la base y hay
 * que mostrarlo bien igual.
 *
 * Devuelve el texto principal (`body.text`, también dentro de `interactive`) y
 * las opciones que llevaba el mensaje (`action.buttons[].reply.title` y
 * `action.sections[].rows[].title` + `description`), que se pintan como los
 * botones de WhatsApp debajo del texto.
 *
 * Si el contenido no es ese JSON —o no se le puede sacar nada— se devuelve tal
 * cual llegó, sin tocarlo.
 */
export function formatearContenido(contenido: string): {
  texto: string;
  opciones: string[];
} {
  const crudo = contenido.trim();
  const talCual = { texto: contenido, opciones: [] as string[] };
  if (!crudo.startsWith("{")) return talCual;

  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    // El preview de la lista llega recortado por el backend, así que el JSON
    // ni siquiera cierra: se rescata a la brava el primer «text» que aparezca.
    const suelto = primerTexto(crudo);
    return suelto ? { texto: suelto, opciones: [] } : talCual;
  }

  if (!esObjeto(dato)) return talCual;

  // `{"type":"interactive","interactive":{…}}` mete el cuerpo un nivel adentro.
  const interno = esObjeto(dato.interactive) ? dato.interactive : null;
  const texto = (interno && textoDeCuerpo(interno)) || textoDeCuerpo(dato) || "";
  const opciones = interno ? opcionesDe(interno) : opcionesDe(dato);

  if (!texto && opciones.length === 0) return talCual;
  return { texto, opciones };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/** Solo nos sirven los strings con algo escrito. */
function comoTexto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio || null;
}

function textoDeCuerpo(nodo: Record<string, unknown>): string | null {
  const body = nodo.body;
  if (esObjeto(body)) {
    const t = comoTexto(body.text);
    if (t) return t;
  }
  return comoTexto(nodo.text);
}

function opcionesDe(nodo: Record<string, unknown>): string[] {
  const accion = nodo.action;
  if (!esObjeto(accion)) return [];

  const opciones: string[] = [];

  // Mensaje de botones: action.buttons[].reply.title
  if (Array.isArray(accion.buttons)) {
    for (const boton of accion.buttons) {
      if (!esObjeto(boton)) continue;
      const reply = boton.reply;
      const titulo = esObjeto(reply)
        ? comoTexto(reply.title)
        : comoTexto(boton.title);
      if (titulo) opciones.push(titulo);
    }
  }

  // Mensaje de lista: action.sections[].rows[].title (+ description)
  if (Array.isArray(accion.sections)) {
    for (const seccion of accion.sections) {
      if (!esObjeto(seccion) || !Array.isArray(seccion.rows)) continue;
      for (const fila of seccion.rows) {
        if (!esObjeto(fila)) continue;
        const titulo = comoTexto(fila.title);
        if (!titulo) continue;
        const detalle = comoTexto(fila.description);
        opciones.push(detalle ? `${titulo} — ${detalle}` : titulo);
      }
    }
  }

  return opciones;
}

/** `"text":"…"` cerrado. */
const RE_TEXTO_CERRADO = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/;
/** `"text":"…` sin cerrar, porque el preview viene recortado. */
const RE_TEXTO_ABIERTO = /"text"\s*:\s*"((?:\\.|[^"\\])*)$/;

function primerTexto(crudo: string): string | null {
  const cerrado = RE_TEXTO_CERRADO.exec(crudo);
  if (cerrado?.[1]) return desescapar(cerrado[1]);
  const abierto = RE_TEXTO_ABIERTO.exec(crudo);
  if (abierto?.[1]) {
    const parcial = desescapar(abierto[1]);
    return parcial ? `${parcial}…` : null;
  }
  return null;
}

/** `\n`, `\"`, `\uXXXX`… a caracteres de verdad. */
function desescapar(escapado: string): string {
  // Si el recorte cortó a mitad de un escape queda un `\` colgando que rompe
  // el parseo; se poda antes de intentar.
  const limpio = escapado.replace(/\\+$/, "");
  try {
    return String(JSON.parse(`"${limpio}"`)).trim();
  } catch {
    return limpio.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
  }
}

/* -------------------------------------------------------------------------- */
/* Burbuja                                                                     */
/* -------------------------------------------------------------------------- */

/** Botón redondo del menú que aparece al pasar el mouse por la burbuja. */
const BOTON_ACCION = cn(
  "grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft",
  "transition-colors hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
);

/**
 * Una burbuja del hilo. Entrantes a la izquierda sobre la superficie de la
 * tarjeta, salientes a la derecha en verde suave. La esquina del lado propio va
 * menos redondeada, como en WhatsApp.
 *
 * La meta —quién lo mandó, la hora y el estado de entrega— vive abajo a la
 * derecha dentro de la burbuja, en chiquito, para no robar altura.
 *
 * Al pasar el mouse aparece un menú discreto para citar el mensaje en el
 * composer o copiar su texto.
 */
export function BurbujaMensaje({
  mensaje: m,
  onResponder,
}: {
  mensaje: MensajeRow;
  /** Ausente cuando no se le puede responder a esta conversación. */
  onResponder?: (texto: string) => void;
}) {
  const esSaliente = m.direccion === "saliente";
  const estado = estadoLegible(m.estado);
  const { texto, opciones } = formatearContenido(m.contenido?.trim() ?? "");
  /** Con media, un contenido tipo `[image]` es relleno, no un texto real. */
  const textoVisible =
    texto && !(m.mediaUrl && /^\[[a-z]+\]$/i.test(texto)) ? texto : null;
  const sinNada = !textoVisible && !m.mediaUrl && opciones.length === 0;

  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(id);
  }, [copiado]);

  async function copiar() {
    if (!textoVisible) return;
    try {
      await navigator.clipboard.writeText(textoVisible);
      setCopiado(true);
    } catch {
      /* sin permiso de portapapeles no hay nada que hacer */
    }
  }

  return (
    <div
      className={cn(
        "group flex items-end gap-1.5",
        esSaliente ? "justify-end" : "justify-start",
      )}
    >
      {/* En táctil no hay hover: ahí los botones se quedan visibles. */}
      {textoVisible && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 self-center transition-opacity",
            "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
            esSaliente ? "order-first" : "order-last",
          )}
        >
          {onResponder && (
            <button
              type="button"
              onClick={() => onResponder(textoVisible)}
              title="Responder citando este mensaje"
              aria-label="Responder citando este mensaje"
              className={BOTON_ACCION}
            >
              <Reply className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => void copiar()}
            title={copiado ? "Copiado" : "Copiar texto"}
            aria-label={copiado ? "Texto copiado" : "Copiar el texto del mensaje"}
            className={cn(
              BOTON_ACCION,
              copiado &&
                "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-[0_1px_2px_rgb(20_25_20/0.06)] sm:max-w-[72%]",
          esSaliente
            ? "rounded-br-md border border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/12"
            : "rounded-bl-md border border-border bg-card",
        )}
      >
        {m.mediaUrl && (
          <MediaMensaje
            url={m.mediaUrl}
            mime={m.mediaMime}
            nombre={m.mediaNombre}
          />
        )}

        {textoVisible && (
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground",
              m.mediaUrl && "mt-2",
            )}
          >
            {textoVisible}
          </p>
        )}

        {/* Los botones/lista que llevaba el mensaje original (ver
            `formatearContenido`), como los pinta WhatsApp: apilados y al centro. */}
        {opciones.length > 0 && (
          <ul
            className={cn(
              "space-y-1 border-t border-border/60 pt-2",
              textoVisible || m.mediaUrl ? "mt-2" : "",
            )}
          >
            {opciones.map((opcion, i) => (
              <li
                key={`${i}-${opcion}`}
                className="rounded-lg border border-border/70 bg-background/60 px-2 py-1 text-center text-[11px] font-medium leading-snug text-muted-foreground"
              >
                {opcion}
              </li>
            ))}
          </ul>
        )}

        {sinNada && (
          <p className="text-[13.5px] italic text-muted-foreground">
            Mensaje sin contenido
          </p>
        )}

        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] leading-none text-muted-foreground/75">
          {esSaliente &&
            (m.agenteNombre ? (
              <span className="max-w-28 truncate font-medium">
                {m.agenteNombre}
              </span>
            ) : (
              <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 font-medium">
                bot
              </span>
            ))}
          {esSaliente && <span aria-hidden>·</span>}
          <span className="tabular-nums">{fmtHora(m.createdAt)}</span>
          {esSaliente && estado && (
            <>
              <span aria-hidden>·</span>
              <span>{estado}</span>
            </>
          )}
        </div>

        {m.error && (
          <p
            title={m.error}
            className="mt-1.5 flex items-start gap-1 border-t border-red-500/20 pt-1.5 text-xs leading-snug text-red-600/90 dark:text-red-400/90"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="line-clamp-2 min-w-0 flex-1">{m.error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Imagen, audio, video o archivo genérico según el mime. */
function MediaMensaje({
  url,
  mime,
  nombre,
}: {
  url: string;
  mime: string | null;
  nombre: string | null;
}) {
  const tipo = mime ?? "";

  if (tipo.startsWith("image/")) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={nombre ?? "Abrir imagen"}
        className="block overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={nombre ?? "Imagen"}
          className="max-h-64 w-full max-w-xs object-cover"
        />
      </a>
    );
  }

  if (tipo.startsWith("audio/")) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls src={url} className="w-56 max-w-full" />
    );
  }

  if (tipo.startsWith("video/")) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        controls
        src={url}
        className="max-h-64 w-full max-w-xs rounded-xl border border-border"
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors hover:bg-accent"
    >
      <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 truncate text-xs text-foreground">
        {nombre ?? "Archivo adjunto"}
      </span>
    </a>
  );
}
